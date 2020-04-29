const Hutch = require("./hutch-base.js");
const {validateQueueName} = require("./util.js");
const DEFAULT_REDUCE_DURATION = 5;

/**
 * Allows to throttle or reduce messages on a queue for noisy sources
 * @param {*} queueName 
 * @param {*} options 
 */
Hutch.prototype.reduceQueue = function(fromQueue, options, fn, finisher) {
    throw new Error("reduceQueue is not yet implemented");
    validateQueueName(fromQueue);
    var toQueue     = options.toQueue;
    var duration    = options.duration || DEFAULT_REDUCE_DURATION;

    this.consumeQueue(fromQueue, consumeOptions, function(data, msg, controls) {
        var initialResult = fn(data, msg, controls);
        return Promise.resolve(initialResult)
            .then(result => {
                
            });
    });
};