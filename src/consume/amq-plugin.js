const {parseAmqMessage, messageFromData, sendDataOnChannel} = require("../message-processor.js");

const amqPlugin = {
    install(consumer) {
        // Setup the default queue consumer
        consumer.channel.assertQueue(consumer.queueName, { durable: true });
        consumer.channel.consume(consumer.queueName, function(rawMessage) {

            var hutchMsg = parseAmqMessage(rawMessage);

            var completeAck = (hutchMsg) => consumer.channel.ack(hutchMsg);
            var completeNack = (hutchMsg, options) => {
                var delay, resetData = false, requeue = false;
                if(options === true) {
                    delay = 0;
                    requeue = true;
                } else if(options === false) {
                    requeue = false;
                    delay = 0;
                } else if(options) {
                    delay = options.requeueWithDelay || 0;
                    if(options.requeue !== undefined) {
                        requeue = options.requeue;
                    }     
                    if(options.resetData !== undefined) {
                        resetData = options.resetData;
                    }
                    if(options.data !== undefined) {
                        hutchMsg.data = options.data;
                        resetData = false;
                        if(options.resetData !== undefined) {
                            console.warn("nack option.data implies resetData = false and overrides resetData if set");
                        }
                    }
                }

                if(requeue && !resetData) {
                    hutchMsg.raw.content = hutchMsg.toBuffer();
                }

                setTimeout(() => {
                    consumer.channel.nack(hutchMsg.raw, false, requeue);
                }, delay);                
            };


            
            try {
                return consumer.consumeMessage(hutchMsg, completeAck, completeNack);

            } catch(err) {
                console.warn(`An error occurred while processing a message in Queue ${consumer.queueName}`);
                console.error(err);
                consumer.controls.nack();
            }
        }, { noAck: false }, function(err, ok) {
            if(err) {
                console.warn("Something went wrong while consuming a queue: " + consumer.queueName);
                console.error(err);
                throw err;
            }
            consumer.consumerTag = ok.consumerTag;
        });        
    }
}

module.exports = amqPlugin;