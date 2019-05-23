# rabbitmq-hutch
A wrapper to simplify dealing with multiple RabbitMQ queues or a continous stream of tasks

## Why Use Rabbit Hutch?

- Timeout handling to prevent tasks that never finish from freezing your application
- Simplified interaction with Rabbit, just provide the url, queue name and handler
- Improved console logging makes it more clear which tasks are running

## Installation

    // For npm
    npm install rabbitmq-hutch --save

    // For yarn
    yarn add rabbitmq-hutch

## Usage

    const RabbitHutch = require("rabbitmq-hutch");
    var hutch = new RabbitHutch("amqp://...");
    hutch.connect()
        .then(channel => {
            hutch.consumeQueue("my-queue", { timeLimit: 1000 * 60 * 3 }, function(data, msg, controls) {
                // Do some work
                // ...

                // Acknowledge once you've finished
                controls.ack();
            })

            // The options argument is optional, you can just go straight to the function if you don't need it.
            hutch.consumeQueue("another-queue", function(data, msg, controls) {

            })
        });

### controls.ack()
Calls Rabbit MQ's ack function, and also performs some cleanup and completion work inside of Hutch. Calling this will allow the application to process a new message from the queue.

## controls.nack()
Calls Rabbit MQ's nack function, and also performs some cleanup and completion work inside of Hutch. Calling this will allow the application to process a new message from the queue.

### controls.cancelTimeout()
If for some reason you don't want the consumer function to be able to timeout for running too long, you can cancel the timeout manually. The timeout normally is in place to cancel a task if it is presumably stuck/frozen.

### controls.retry()
*controls.retry(delay=0)*
Hutch provides a method for retrying the consume function, this can be useful if the function had an exception or failure that is temporally limited. (e.g. throttled API call)

The number of times a message will be re-attempted is limited by the attemptLimit option passed into consumeQueue(queue, options). By default the limit 3, which includes the first attempt before any retries.

## Optional Express Integration
You may want to be able to run your functions through a REST call, maybe for testing, or maybe for other purposes.

If you are using express, or an express-like interface, you can pass it in to get URL endpoints automatically generated for each queue.

    var hutch = new RabbitHutch("amqp://...", { expressApp: app });
    hutch.connect()
        .then(() => {
            hutch.consumeQueue("my-queue", ...)
        });

    // Now you can use: manually send a message to the queue like so:
    // POST http://<YOUR-DOMAIN>/consume/my-queue

With the express integration, Hutch tries to mimic the normal message queue process as closely as possible, so it is a great way to test your queue consumer functions without having to run the full pipeline.