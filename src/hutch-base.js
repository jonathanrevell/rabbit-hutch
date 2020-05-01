/**
 * @class RabbitHutch
 * @param {*} url - RabbitMQ endpoint URL
 * @param {RabbitHutchOptions} [options]
 */
const Hutch = function(url, options) {
    if(!options) {
        options = {
            overrideLogger: true,
            crashCleanup: true
        };
    }
    this.url = url;

    this.connection         = options.connection;
    this.channel            = options.channel;
    this.expressApp         = options.expressApp;
    this.prefetchLimit      = options.prefetch || 1;
    this.debug              = options.debug || false;
    this.overrideLogger     = options.overrideLogger === undefined ? true : options.overrideLogger;
    this.crashCleanup       = options.crashCleanup === undefined ? true : options.crashCleanup;
    this.criticalHandler    = options.criticalHandler;

    this.briefConnections   = 0;
    this.hasLongConnection  = false;

    if(this.crashCleanup) {
        try {
            var self = this;
            if(this.debug) {
                console.log("RabbitHutch running with crashCleanup enabled. Will close connections on exit");
            }

            // Based on https://stackoverflow.com/a/14032965
            var exitHandler = function (options, exitCode) {
                self.disconnect();
                if (options.cleanup) {
                    // console.log('clean');
                }
                if (exitCode || exitCode === 0) { 
                    // console.log(exitCode);
                }
                if (options.exit) {
                    process.exit();
                }
            };
            
            //do something when app is closing
            process.on('exit', exitHandler.bind(null,{cleanup:true}));
            
            //catches ctrl+c event
            process.on('SIGINT', exitHandler.bind(null, {exit:true}));
            
            // catches "kill pid" (for example: nodemon restart)
            process.on('SIGUSR1', exitHandler.bind(null, {exit:true}));
            process.on('SIGUSR2', exitHandler.bind(null, {exit:true}));
            
            //catches uncaught exceptions
            process.on('uncaughtException', exitHandler.bind(null, {exit:true}));   

        } catch(err) {
            console.warn("An error occurred while setting up crashCleanup");
            console.error(err);
        }
    }
};


Hutch.prototype.runCriticalHandler = function(options) {
    if(this.criticalHandler) {
        if(typeof this.criticalHandler === "string") {
            var queueName = this.criticalHandler;
            if(options.task) {
                options.task.controls.forward(queueName, { ack: false });
            } else if(options.message) {
                this.sendToQueue(queueName, message, options);
            } else {
                throw new Error("you must provide either the task or message to runCriticalHandler")
            }
        } else if(typeof this.criticalHandler === "function") {
            this.criticalHandler(this.message);
        } else {
            console.log(this.criticalHandler);
            throw new Error("Unrecognized criticalHandler");
        }
    } else {
        console.warn("No criticalHandler provided to RabbitHutch, controls.critical() and callTree works best with a criticalHandler");
    }        
};


module.exports = Hutch;