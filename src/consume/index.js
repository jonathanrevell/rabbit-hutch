const Hutch = require("../hutch-base.js");
const {validateQueueName} = require("../util.js");
const HutchConsumer = require("./consumer.js");
const expressPlugin = require("./express-plugin.js");
const amqPlugin = require("./amq-plugin.js");

/**
 * Consumes a single message from a queue
 * @param {*} queueName 
 * @param {*} [options] - timeLimit, channel, attemptLimit
 * @param {*} fn 
 */
Hutch.prototype.consumeQueue = function(queueName, options, fn) {
    validateQueueName(queueName);
    // options is optional. If not defined then the 2nd arg is the fn
    if(fn === undefined) {
        fn = options;
        options = {};
    }

    var timeLimit       = options.timeLimit;
    var channel         = options.channel || this.channel;
    var attemptLimit    = options.attemptLimit || 3;

    
    if(timeLimit === undefined || timeLimit === null || isNaN(timeLimit)) {
        timeLimit = 1000 * 60 * 5; // Default timeLimit is 5 minutes;
    }
    
    var consumer = new HutchConsumer(this, fn, channel, queueName, { attemptLimit, timeLimit });

    // Install the default AMQ consumer
    amqPlugin.install(consumer);

    // Setup a manual REST route for triggering the action, usually for testing
    if(this.expressApp) {
        expressPlugin.install(consumer, this.expressApp);
    }
};