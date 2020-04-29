const HutchConsumerTask = require("./consumer-task.js");

function HutchConsumer(hutch, fn, channel, queueName, { attemptLimit, timeLimit }) {
    this.hutch          = hutch;
    this.fn             = fn;
    this.channel        = channel;
    this.queueName      = queueName;
    this.attemptLimit   = attemptLimit;
    this.timeLimit      = timeLimit;
    this.consumerTag    = null;
}

HutchConsumer.prototype.consumeMessage = function(hutchMessage, completeAck, completeNack) {
    var task = new HutchConsumerTask(this, completeAck, completeNack);
    return task.run(hutchMessage);
};

HutchConsumer.prototype.use = function(plugin, options) {
    plugin.install(this, options);
};




module.exports = HutchConsumer;