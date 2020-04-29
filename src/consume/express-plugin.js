const {parseAmqMessage, messageFromData, sendDataOnChannel} = require("../message-processor.js");

const expressPlugin = {
    install(consumer, {expressApp}) {
        expressApp.post(`/consume/${consumer.queueName}`, function(req, res) {
            var hutchMsg = messageFromData(req.body);
        
            var completeAck = (hutchMsg) => res.status(200).send(hutchMsg);
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
                    hutchMsg.content = hutchMsg.data;
                }                    
    
                setTimeout(() => {
                    res.status(500).send(hutchMsg);
                }, delay);                    
            };
        
            try {
                return consumer.consumeMessage(hutchMsg, completeAck, completeNack);
                
            } catch(err) {
                console.warn(`An error occurred while processing a message in Queue ${consumer.queueName}`);
                console.error(err);
                consumer.controls.nack();
            }
        });        
    }   
}
module.exports = expressPlugin;