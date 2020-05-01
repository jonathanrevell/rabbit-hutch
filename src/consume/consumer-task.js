const LOGGER = require("../log-interceptor.js");
const {assertMessage, DEFAULT_MESSAGE_TYPE} = require("../message-processor.js");
const {processCallTree, nackCallTree} = require("./call-tree.js");
const {CriticalMessageError, PendingResolutionError} = require("../errors.js");

function HutchConsumerTask(consumer, completeAck, completeNack) {
    this.consumer = consumer;
    this.hutch = this.consumer.hutch;
    this.completeAck = completeAck;
    this.completeNack = completeNack;


    var attemptCounter = 0;
    this.randomId = Math.random() * 1000;

    var finished = false;
    var finishType = null;

    this.controls = {
        cancelTimeout: () => {
            if(this.timeout) {
                clearTimeout(this.timeout);
                this.timeout = null;
            }
        },

        retry: (delay) => {
            if(delay === undefined) {
                delay = 0;
            }
            if(attemptCounter < this.consumer.attemptLimit) {
                setTimeout(function() {
                    attemptCounter++;
                    fn(obj, this.message, controls);
                }, delay);
            } else {
                this.controls.nack();
            }
        },

        stopConsuming: () => {
            channel.cancel(this.consumer.consumerTag);
        }
    };


    this.timeout = setTimeout(() => {
        if(!finished) {
            console.warn(`TIMED OUT`);
            finished = true;
            finishType = "timeout/nack";
            nack(true);
        }
    }, this.consumer.timeLimit);

    this.cleanup = () => {
        LOGGER.queueName = LOGGER.NO_QUEUE;
        LOGGER.messageId = null;
        if(this.hutch.overrideLogger) {
            LOGGER.switchOff();
        }
    };

    this.controls.ack = () => {
        if(!finished) {
            this.controls.cancelTimeout();
            finished = true;
            finishType = "ack";
            processCallTree(this.hutch, this.message);
            console.log("---- FINISHED PROCESSING " + this.consumer.queueName + " MESSAGE ----");
            this.cleanup();
            return completeAck(this.message);
        } else {
            console.warn(`already ${finishType}, cannot ack`);
        }
    };

    this.controls.nack = (options={}) => {
        if(!finished) {
            this.controls.cancelTimeout();
            finished = true;
            finishType = "nack";
            console.log(`-- Failed`);
            nackCallTree(this.hutch, this.message, options);
            this.cleanup();               
            return completeNack(this.message, options);
        } else if(finishType == "timeout/nack") {
            nackCallTree(this.hutch, this.message, options);
            this.cleanup();            
            return completeNack(this.message, options);
        } else {
            console.warn(`${finishType} already ocurred, cannot nack`);
        }
    };

    this.controls.requeue = (options) => {
        if(!options) {
            options = { requeueWithDelay: 1000 }; 
        }
        options.requeue = true;
        if(!finished) {
            this.controls.cancelTimeout();
            finished = true;
            finishType = "nack";
            console.log(`-- Failed/Requeued`);
            this.cleanup();               
            return completeNack(this.message, options);
        } else if(finishType == "timeout/nack") {
            this.cleanup();            
            return completeNack(this.message, options);
        } else {
            console.warn(`${finishType} already ocurred, cannot nack`);
        }
    };
    
    this.controls.forward = (queueName, options={}) => {
        console.log(`Forwarding message ${this.message.summaryString()} to queue ${queueName}`);
        this.hutch.sendToQueue(queueName, this.message, options);
        if(options.nack === true) {
            return this.controls.nack();
        } else if(options.ack === undefined || options.ack === true) {
            return this.controls.ack();
        } else {
            return true;
        }
    };

    this.controls.sendToQueueInCallTree = (queueName, otherPayload, options={}) => {
        if(!options.type) {
            options.type = DEFAULT_MESSAGE_TYPE;
        }

        var otherMessage = assertMessage(otherPayload, options);
        
        
        otherMessage.addToCallTree(this.message, this.consumer.queueName, options);
        this.hutch.sendToQueue(queueName, otherMessage, options);

        if(options.throw) {
            var errorMessage;
            if(typeof options.throw === "string") {
                errorMessage = options.throw;
            } else {
                errorMessage = `This message cannot succeed as-is, resolving using call tree.`;
            }
            console.warn(`Sending message to ${queueName} to resolve issue with this one.`);
            this.controls.nack();
            throw new PendingResolutionError(errorMessage);
        } else {
            return this.controls.ack();
        }
    };

    this.controls.critical = (options={}) => {
        this.hutch.runCriticalHandler({ task: this, ack: false });
        if(options.nack === undefined || options.nack === true) {
            this.controls.nack();
        }
        if(options.throw === undefined || options.throw === true) {
            console.log("MESSAGE: ", this.message.toString());
            throw new CriticalMessageError();
        } else {
            console.warn("Critical Message Warning, message could not be processed");
        }
    };

    /**
     * Helper function to simplify catching the error thrown by .critical()
     */
    this.controls.catchCritical = (err, options={}) => {
        if(err instanceof CriticalMessageError) {
            if(options.rethrow) {
                throw err;
            } else {
                console.error(err);
                return true;
            }
        } else {
            return false;
        }
    };
}

HutchConsumerTask.prototype.run = function(hutchMessage) {
    this.message = hutchMessage;
    LOGGER.queueName = this.consumer.queueName;
    LOGGER.messageId = this.message.deliveryTag || `R-${this.randomId}`;
    if(this.hutch.overrideLogger) {
        LOGGER.switchOn();
    }
    
    console.log(`---- START OF ${this.consumer.queueName} MESSAGE ----`);
    console.log(hutchMessage.summaryString());

    return this.consumer.fn(hutchMessage.data, hutchMessage, this.controls);
};

module.exports = HutchConsumerTask;