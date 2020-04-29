const Hutch = require("./hutch-base.js");
const Collector = require("./collector.js");
const {validateQueueName} = require("./util.js");

/**
 * Starts a collector for aggregating data elements; This is useful if you don't want to do something with large amounts of data
 * but don't want to send all the data at once and don't want each item to be send individually
 * @param {CollectorOptions} options - {sizeLimit, itemsName}
 * @returns {Collector} returns a new Collector. Use collector.add to add a data item to it. If you are sending the batch to be processed elsewhere you can use {@link RabbitHutch.sendCollectorToQueue}
 */
Hutch.prototype.startCollector = function(options) {
    return new Collector(options);
};


/**
 * Sends all the data in a collector to a queue. The items are separated into batches which each get their own message
 * @param {*} queue 
 * @param {*} collector 
 * @param {*} options 
 */
Hutch.prototype.sendCollectorToQueue = function(queue, collector, options) {
    validateQueueName(queue);
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
};

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
Hutch.prototype.consumeQueueMultipart = function(queueName, options, messageFn, doneFn) {
    validateQueueName(queueName);
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
};  