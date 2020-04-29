const LOGGER = require("../log-interceptor.js");
const {assertMessage} = require("../message-processor.js");
const {processCallTree} = require("./call-tree.js");

function HutchConsumerTask(consumer, completeAck, completeNack) {
    this.consumer = consumer;
    this.hutch = this.consumer.hutch;
    this.consumeAck = consumeAck;
    this.consumeNack = consumeNack;


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

    this.controls.nack = (options) => {
        if(!finished) {
            this.controls.cancelTimeout();
            finished = true;
            finishType = "nack";
            console.log(`-- Failed`);
            this.cleanup();               
            return completeNack(this.message, options);
        } else if(finishType == "timeout/nack") {
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
    
    this.controls.forward = (queueName, options) => {
        console.log(`Forwarding message ${this.message.summaryString()} to queue ${queueName}`);
        this.hutch.sendToQueue(queueName, this.message, options);
        return this.controls.ack();
    };

    this.controls.sendToQueueInCallTree = (queueName, otherPayload, options) => {
        var otherMessage = assertMessage(otherPayload);
        
        otherMessage.addToCallTree(this.message, this.consumer.queue, options);
        this.hutch.sendToQueue(queueName, otherMessage, options);

        return this.controls.ack();
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