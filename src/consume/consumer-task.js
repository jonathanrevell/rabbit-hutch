const LOGGER = require("../log-interceptor.js");

function HutchConsumerTask(consumer, completeAck, completeNack) {
    this.consumer = consumer;
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
                    fn(obj, msg, controls);
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
        if(this.consumer.hutch.overrideLogger) {
            LOGGER.switchOff();
        }
    };

    this.controls.ack = () => {
        if(!finished) {
            this.controls.cancelTimeout();
            finished = true;
            finishType = "ack";
            console.log("---- FINISHED PROCESSING " + this.consumer.queueName + " MESSAGE ----");
            this.cleanup();
            return completeAck(msg);
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
            return completeNack(msg, options);
        } else if(finishType == "timeout/nack") {
            this.cleanup();            
            return completeNack(msg, options);
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
            return completeNack(msg, options);
        } else if(finishType == "timeout/nack") {
            this.cleanup();            
            return completeNack(msg, options);
        } else {
            console.warn(`${finishType} already ocurred, cannot nack`);
        }
    };    
}

HutchConsumerTask.prototype.run = function(hutchMessage) {
    LOGGER.queueName = this.consumer.queueName;
    LOGGER.messageId = msg.deliveryTag || `R-${this.randomId}`;
    if(this.consumer.hutch.overrideLogger) {
        LOGGER.switchOn();
    }
    
    console.log(`---- START OF ${this.consumer.queueName} MESSAGE ----`);
    console.log(hutchMessage.summaryString());

    return this.consumer.fn(hutchMessage.data, hutchMessage, this.controls);
};

module.exports = HutchConsumerTask;