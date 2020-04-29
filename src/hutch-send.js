const Hutch = require("./hutch-base.js");
const {validateQueueName} = require("./util.js");
const {sendDataOnChannel} = require("./message-processor.js");

/**
 * Sends a message to the specified queue
 * @param {*} queue 
 * @param {*} payload 
 * @param {*} [options] - channel
 */
Hutch.prototype.sendToQueue = function( queue, payload, options ) {
    validateQueueName(queue);
    if(options === undefined) {
        options = {};
    }
    var channel     = options.channel || this.channel;

    channel.assertQueue(queue, { durable: true });
    sendDataOnChannel(channel, queue, data, options);
};


/**
 * Sends a batch of messages to the queue
 * @param {*} queue 
 * @param {Array} payloadsArray 
 * @param {*} [options] 
 */
Hutch.prototype.sendBatchToQueue = function(queue, payloadsArray, options) {
    validateQueueName(queue);
    if(options === undefined) {
        options = {};
    }
    var channel     = options.channel || this.channel;
    
    channel.assertQueue(queue, { durable: true });

    console.log(`Sending batch of ${payloadsArray.length} messages to queue`);
    payloadsArray.forEach(payload => {
        sendDataOnChannel(channel, queue, payload, options);
    });
};