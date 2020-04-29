const amqplib = require("amqplib/callback_api");
const Hutch = require("./hutch-base.js");

/**
 * Connects to your RabbitMQ endpoint
 */
Hutch.prototype.connect = function(options) {
    if(!options) {
        options = {};
    }
    if(!this.channel) {
        return new Promise((resolve, reject) => {
            if(!options.brief) {
                this.hasLongConnection = true;
            }
            amqplib.connect(this.url, (err, conn) => {
                if(err) {
                    console.warn("Failed to connect to Rabbit MQ");
                    console.error(err);
                    reject(err);
                } else {
                    this.connection = conn;
                    this.connection.createChannel((err, channel) => {
                        if(err) {
                            console.warn("Failed to create a Rabbit MQ channel");
                            console.err(err);
                            throw err;
                        }
                        this.channel = channel;
                        this.channel.prefetch(this.prefetchLimit); // Don't dispatch another message until the worker is done with this one

                        resolve(this.channel);
                    });
                }
            });
        });
    } else {
        return Promise.resolve(this.channel);
    }
};

Hutch.prototype.disconnect = function() {
    try {
        if(this.channel) {
            this.channel.close();
            this.channel = null;
        }
        if(this.connection) {
            this.hasLongConnection = false;
            this.connection.close();
            this.connection = null;
        }
    } catch(err) {
        console.error(err);
    }
};


/**
 * Creates a brief connection with Rabbit which terminates with the resolution of the function passed
 * You can either return a value or a promise from the function. The connection will close upon completion
 * This method should be used to wrap calls like "sendToQueue" when you are running in an environment where (1) you don't need to listen to the queue and (2) you only occassionally send messages
 * @param {*} fn 
 */
Hutch.prototype.briefConnect = function(fn) {
    if(this.hasLongConnection) {
        throw "Cannot use briefConnect when a long-lived connection has already been established";
    }

    var fnResult;
    function errorHandler(err) {
        console.warn("briefConnect encountered an error and is closing the connection to Rabbit");
        console.error(err);
        attemptCleanup();           
    }

    // We only disconnect once all brief connectors are finished
    function attemptCleanup() {
        this.briefConnections--;
        if(this.briefConnections <= 0) {
            this.briefConnections = 0;
            this.disconnect();
        }
    }

    try  {
        return this.connect({ brief: true })
            .then(() => {
                this.briefConnections++;
                fnResult = fn();
                return Promise.resolve(fnResult);
            })
            .then(() => {
                attemptCleanup();
            })
            .catch(err => {
                errorHandler(err);
            });
    } catch(err) {
        errorHandler(err);
    }
};