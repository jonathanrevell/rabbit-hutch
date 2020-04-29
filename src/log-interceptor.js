const LOGGER = {
    originalConsoleLog: console.log,
    originalConsoleWarn: console.warn,
    queueName: 'no-queue',
    messageId: null,
    NO_QUEUE: "no-queue",
    switchOn() {
        console.log = LOGGER.log;
    },
    switchOff() {
        console.log = LOGGER.originalConsoleLog;
    },
    log() {
        var args = [];
        if(LOGGER.messageId) {
            args.push(`MQ[${LOGGER.queueName}:${LOGGER.messageId}]`);
        } else if(LOGGER.queueName) {
            args.push(`MQ[${LOGGER.queueName}]`);
        } else {
            args.push(`MQ`);
        }

        for(var i = 0; i < arguments.length; i++) {
            args.push(arguments[i]);
        }
        return LOGGER.originalConsoleLog.apply(console, args);
    }
};

module.exports = LOGGER;