# rabbitmq-hutch
A wrapper to simplify dealing with multiple RabbitMQ queues or a continous stream of tasks

## Why Use Rabbit Hutch?

- Timeout handling to prevent tasks that never finish from freezing your application
- Simplified interaction with Rabbit, just provide the url, queue name and handler
- Improved console logging makes it more clear which tasks are running
- Process data by dividing into manageable batches with hutch.startCollector
- Easily test your queue consumer functions with REST endpoints

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

## hutch.consumeQueue(queue, options, fn)

### controls.ack()
Calls Rabbit MQ's ack function, and also performs some cleanup and completion work inside of Hutch. Calling this will allow the application to process a new message from the queue.

### controls.nack()
Calls Rabbit MQ's nack function, and also performs some cleanup and completion work inside of Hutch. Calling this will allow the application to process a new message from the queue.

### controls.cancelTimeout()
If for some reason you don't want the consumer function to be able to timeout for running too long, you can cancel the timeout manually. The timeout normally is in place to cancel a task if it is presumably stuck/frozen.

### controls.retry()
*controls.retry(delay=0)*
Hutch provides a method for retrying the consume function, this can be useful if the function had an exception or failure that is temporally limited. (e.g. throttled API call)

The number of times a message will be re-attempted is limited by the attemptLimit option passed into consumeQueue(queue, options). By default the limit 3, which includes the first attempt before any retries.

## hutch.consumeQueueMultipart( queue, options, messageFn, doneFn )
Sometimes you may need to wait for other messages to arrive, or may divide a message into multiple parts for easier consumption. Each message is parsed with the messageFn function, which should aggregate or reduce the messages and persist the data elsewhere. messageFn returns a promise which resolves with an object. This object has a "done" property indicating whether all the parts have been received.

The messageFn should determine whether the current message is the "last" message, meaning all messages have been received. 


    hutch.consumeQueueMultipart("my-queue", {...}, 
        function messageFn(data, msg, controls) {
            var allMessagesReceived = false;

            // 1. Evaluate and process the data as needed
            process(data);

            // 2. Fetch any existing aggregation from this batch
            var aggregatedResult = fetch();

            // 3. Persist the reduction or aggregation of messages
            save(aggregatedResult);

            // 4. return a promise
            if(aggregatedResult.messageCount == data.totalBatches) {
                allMessagesReceived = true;
            }
            return Promise.resolve({ done: allMessagesReceived, data: aggregatedResult });
        },
        function doneFn(partialResult, msg, controls) {

        }
    )

In general you should try persisting the data about the messages outside of Rabbit and your program's working memory, as you could have more than one consumer, or in the event of failure.

## hutch.startCollector( options )
Starts a new collector that can be used to aggregate data items together for processing in batches.

## hutch.sendCollectorToQueue( queue, collector, options )
Sends the collector's items to the specified queue, with the items split up into batches, one batch per message.

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