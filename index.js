const amqplib = require("amqplib/callback_api");
const Collector = require("./collector.js");

const LOGGER = {
    originalConsoleLog: console.log,
    originalConsoleWarn: console.warn,
    queueName: 'no-queue',
    messageId: null,
    NO_QUEUE: "no-queue",
    switchOn() {
        console.log = LOGGER.log;
    },
    switchOff() {
        console.log = LOGGER.originalConsoleLog;
    },
    log() {
        var args = [];
        if(LOGGER.messageId) {
            args.push(`MQ[${LOGGER.queueName}:${LOGGER.messageId}]`);
        } else if(LOGGER.queueName) {
            args.push(`MQ[${LOGGER.queueName}]`);
        } else {
            args.push(`MQ`);
        }

        for(var i = 0; i < arguments.length; i++) {
            args.push(arguments[i]);
        }
        return LOGGER.originalConsoleLog.apply(console, args);
    }
};

/**
 * @typedef {Object} RabbitHutchOptions
 * @property {string} channel
 * @property {Express} expressApp
 * @property {integer} prefetchLimit
 * @property {boolean} overrideLogger
 * 
 */

/**
 * @typedef {Object} RabbitHutchConsumeControls
 * @property {Function} cancelTimeout - Cancels the Timeout protection, allowing the function to run indefinitely
 * @property {Function} retry - Retries processing the message without requeing it
 * @property {Function} ack - Acknowledges the message
 * @property {Function} nack - Negative Acknowledges the message (processing failed)
 */


 /**
  * @typedef {Function} RabbitHutchConsumeCallback
  * @param {*} obj 
  * @param {RabbitMQ.Message} msg fn(obj, msg, controls);
  * @param {RabbitHutchConsumeControls} controls
  */



/**
 * @class RabbitHutch
 * @param {*} url - RabbitMQ endpoint URL
 * @param {RabbitHutchOptions} [options]
 */
const Hutch = function(url, options) {
    if(options === undefined) {
        options = {};
    }
    this.url = url;

    this.channel            = options.channel;
    this.expressApp         = options.expressApp;
    this.prefetchLimit      = options.prefetch || 1;
    this.overrideLogger     = options.overrideLogger === undefined ? true : options.overrideLogger;
};

Hutch.prototype = {
    /**
     * Connects to your RabbitMQ endpoint
     */
    connect: function() {
        if(!this.channel) {
            return new Promise((resolve, reject) => {
                amqplib.connect(this.url, (err, conn) => {
                    if(err) {
                        console.warn("Failed to connect to Rabbit MQ");
                        console.error(err);
                        reject(err);
                    } else {
                        conn.createChannel((err, channel) => {
                            if(err) {
                                console.warn("Failed to create a Rabbit MQ channel");
                                console.err(err);
                                throw err;
                            }
                            this.channel = channel;
                            this.channel.prefetch(this.prefetchLimit); // Don't dispatch another message until the worker is done with this one

                            resolve(this.channel);
                        });
                    }
                });
            });
        } else {
            return Promise.resolve(this.channel);
        }
    },
    /**
     * Sends a message to the specified queue
     * @param {*} queue 
     * @param {*} payload 
     * @param {*} [options] - channel
     */
    sendToQueue: function( queue, payload, options ) {
        if(options === undefined) {
            options = {};
        }
        var channel     = options.channel || this.channel;
        var str         = JSON.stringify(payload);

        console.log(`Sending to other queue ${queue}`, str.substring(0,50));
        channel.assertQueue(queue, { durable: true });
        channel.sendToQueue(queue, Buffer.from(str));  
    },


    /**
     * Sends a batch of messages to the queue
     * @param {*} queue 
     * @param {Array} payloadsArray 
     * @param {*} [options] 
     */
    sendBatchToQueue: function(queue, payloadsArray, options) {
        if(options === undefined) {
            options = {};
        }
        var channel     = options.channel || this.channel;
        
        channel.assertQueue(queue, { durable: true });

        payloadsArray.forEach(payload => {
            var str         = JSON.stringify(payload);
            channel.sendToQueue(queue, Buffer.from(str)); 
        });
    },

    /**
     * Starts a collector for aggregating data elements; This is useful if you don't want to do something with large amounts of data
     * but don't want to send all the data at once and don't want each item to be send individually
     * @param {CollectorOptions} options - {sizeLimit, itemsName}
     * @returns {Collector} returns a new Collector. Use collector.add to add a data item to it. If you are sending the batch to be processed elsewhere you can use {@link RabbitHutch.sendCollectorToQueue}
     */
    startCollector: function(options) {
        return new Collector(options);
    },


    /**
     * Sends all the data in a collector to a queue. The items are separated into batches which each get their own message
     * @param {*} queue 
     * @param {*} collector 
     * @param {*} options 
     */
    sendCollectorToQueue: function(queue, collector, options) {
        collector.forEach((batch, counter) => {
            var payload = {
                timestamp: Date.now(),
                collectorId: collector.id,
                batchIndex: counter,
                totalBatches: collector.batchCount,
                collectorSize: collector.count
            };
            payload[collector.itemsName] = batch.items;
            this.sendToQueue(queue, payload, options);
        });        
    },
    
    /**
     * Consumes a single message from a queue
     * @param {*} queueName 
     * @param {*} [options] - timeLimit, channel
     * @param {*} fn 
     */
    consumeQueue: function(queueName, options, fn) {
        // options is optional. If not defined then the 2nd arg is the fn
        if(fn === undefined) {
            fn = options;
            options = {};
        }

        var consumerTag     = null;
        var timeLimit       = options.timeLimit;
        var channel         = options.channel || this.channel;
        var attemptLimit    = options.attemptLimit || 3;
        var thisHutch = this;

        if(timeLimit === undefined || timeLimit === null || isNaN(timeLimit)) {
            timeLimit = 1000 * 60 * 5; // Default timeLimit is 5 minutes;
        }
        var setupFn = function (obj, msg, completeAck, completeNack) {
            var attemptCounter = 0;
            var randomId = Math.random() * 1000;
            LOGGER.queueName = queueName;
            LOGGER.messageId = msg.deliveryTag || `R-${randomId}`;
            if(thisHutch.overrideLogger) {
                LOGGER.switchOn();
            }
            
            console.log(`---- START OF ${queueName} MESSAGE ----`);
            console.log(JSON.stringify(obj).substr(0,50));
    
            var finished = false;
            var finishType = null;

            var controls = {
                cancelTimeout: () => {
                    if(timeout) {
                        clearTimeout(timeout);
                        timeout = null;
                    }
                },
    
                retry: (delay) => {
                    if(delay === undefined) {
                        delay = 0;
                    }
                    if(attemptCounter < attemptLimit) {
                        setTimeout(function() {
                            attemptCounter++;
                            fn(obj, msg, controls);
                        }, delay);
                    } else {
                        controls.nack();
                    }
                },

                stopConsuming: () => {
                    channel.cancel(consumerTag);
                }
            };

    
            var timeout = setTimeout(() => {
                if(!finished) {
                    console.warn(`TIMED OUT`);
                    finished = true;
                    finishType = "timeout/nack";
                    nack(true);
                }
            }, timeLimit);

            var cleanup = () => {
                LOGGER.queueName = LOGGER.NO_QUEUE;
                LOGGER.messageId = null;
                if(thisHutch.overrideLogger) {
                    LOGGER.switchOff();
                }
            };
    
            var ack = () => {
                if(!finished) {
                    controls.cancelTimeout();
                    finished = true;
                    finishType = "ack";
                    console.log("---- FINISHED PROCESSING " + queueName + " MESSAGE ----");
                    cleanup();
                    return completeAck(msg);
                } else {
                    console.warn(`already ${finishType}, cannot ack`);
                }
            };
    
            var nack = (requeue = false) => {
                if(!finished) {
                    controls.cancelTimeout();
                    finished = true;
                    finishType = "nack";
                    console.log(`-- Failed`);
                    cleanup();               
                    return completeNack(msg, requeue);
                } else if(finishType == "timeout/nack") {
                    cleanup();            
                    return completeNack(msg, requeue);
                } else {
                    console.warn(`${finishType} already ocurred, cannot nack`);
                }
            };
    
            controls.ack = ack;
            controls.nack = nack;
    
            

            // FUNCTION TO CALL
            attemptCounter++;
            fn(obj, msg, controls);
        };
        
        // Setup a manual REST route for triggering the action, usually for testing
        if(this.expressApp) {
            this.expressApp.post(`/consume/${queueName}`, function(req, res) {
                var obj = req.body;
                var msg = {
                    content: obj
                };
            
                var completeAck = (msg) => res.status(200).send(msg);
                var completeNack = (msg, requeue) => res.status(500).send(msg);
            
                setupFn(obj, msg, completeAck, completeNack);
            });
        }

    
    
    
        // Setup the default queue consumer
        channel.assertQueue(queueName, { durable: true });
        channel.consume(queueName, function(msg) {
            var str = msg.content.toString();
    
            var completeAck = (msg) => channel.ack(msg);
            var completeNack = (msg, requeue) => channel.nack(msg, false, requeue);
    
            // Deserialize
            var obj = JSON.parse(str);
      
            setupFn(obj, msg, completeAck, completeNack);
        }, { noAck: false }, function(err, ok) {
            consumerTag = ok.consumerTag;
        });
    },

    /**
     * @typedef {Function} MultipartMessageFunction
     * @param {*} data - the data extracted from the message
     * @param {Rabbit.Message} msg - the full message
     * @param {RabbitHutchConsumeControls} controls - controls for interacting with RabbitMQ or the consumer service
     * 
     * @returns {Promise<Object>} A promise which resolves to an object with a "done" property
     */

    /**
     * Consumes multiple messages over time, taking a special action once all the messages are processed
     * @param {*} queueName - the queue to consume
     * @param {*} [options] - timeLimit, channel
     * @param {MultipartMessageFunction} messageFn - the function to execute for every message must return a promise
     * @param {*} doneFn - the function to execute
     */
    consumeQueueMultipart: function(queueName, options, messageFn, doneFn) {
        // options is optional. If its not included, reorganize the params
        if(doneFn === undefined) {
            doneFn      = messageFn;
            messageFn   = options;
            options     = {};
            
        }
        this.consumeQueue(queueName, options, function(data, msg, controls) {
            
            // We execute a function on each message as it comes in
            messageFn(data, msg, controls)
                .then(partResult => {

                    // If the result of the message function indicates all parts of the message
                    // have been processed, then we execute the done function and pass in the result
                    // instead of the data
                    if(partResult.done) {
                        doneFn(partResult.data, partResult, controls);
                    } else {
                        // Generally speaking the messageFn should not ack or nack
                        controls.ack();
                    }
                });


        });
    }
};


module.exports = Hutch;