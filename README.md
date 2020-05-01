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

If there is an error during processing and you need the queue to try the message again, or try the message with another consumer, you can tell it requeue

    const RabbitHutch = require("rabbitmq-hutch");
    var hutch = new RabbitHutch("amqp://...");
    hutch.connect()
        .then(channel => {
            hutch.consumeQueue("my-queue", { timeLimit: 1000 * 60 * 3 }, function(data, msg, controls) {
                // Do some work
                // ...

                controls.requeue(options);

                // OR
                // Indicate something went wrong, but you want the message to be re-attempted
                controls.nack(true);
                
                // OR
                // If passed without any argument, or false, the message will not be requeued for a reattempt
                controls.nack();


                // OR
                controls.nack({ requeue: true });

                // OR
                // Wait ms before queuing it again. This can be helpful for avoiding getting an endless barrage of message
                controls.nack({ requeueWithDelay: 100 });
            })
        });    

If you requeue, normally the queue will use the data object it passed in to you to pass back to the queue.

If you are building a service or program which (1) does not need to listen to any queues, and, (2) only occasionally needs to send messages to Rabbit, you should use the briefConnect method

    hutch.briefConnect(() => {
        // Do some work

        hutch.sendToQueue("queue-name", payload);
    });

The briefConnect method will disconnect as soon as the function passed in finishes up its work. If you are doing asynchronous work you should return a promise, which RabbitHutch will wait for to complete before closing the connection.

    hutch.briefConnect(() => {
        // Do some work

        return asyncWork()
            .then(() => {
                hutch.sendToQueue("queue-name", payload);
                return true;
            });
    });

The briefConnect method keeps track of all your briefConnect work and ensures that it doesn't close the connection before all the outstanding work is completed.

**Note:** Do not call briefConnect() while an active connection that was created by calling RabbitHutch.connect() directly is still alive. The two methods should not be used together. Either create a long-living connection by calling RabbitHutch.connect() directly, or create short-lived connections as needed with briefConnect().

## hutch.consumeQueue(queue, options, fn)

### controls.ack()

Calls Rabbit MQ's ack function, and also performs some cleanup and completion work inside of Hutch. Calling this will allow the application to process a new message from the queue.

### controls.nack( options )

Calls Rabbit MQ's nack function, and also performs some cleanup and completion work inside of Hutch. Calling this will allow the application to process a new message from the queue.

Options:

- requeue: false

### controls.cancelTimeout()

If for some reason you don't want the consumer function to be able to timeout for running too long, you can cancel the timeout manually. The timeout normally is in place to cancel a task if it is presumably stuck/frozen.

### controls.retry( options )

*controls.retry(delay=0)*
Hutch provides a method for retrying the consume function, this can be useful if the function had an exception or failure that is temporally limited. (e.g. throttled API call)

The number of times a message will be re-attempted is limited by the attemptLimit option passed into consumeQueue(queue, options). By default the limit 3, which includes the first attempt before any retries.

Unlike requeue, this will not send it back to the queue, but will simply attempt the task again after a delay.

### controls.requeue( options )

Send back to the rabbit queue to be processed later and/or on a different channel.

Unlike retry, this performs a nack and you won't know for sure which consumer will pick up the message again or when.

### controls.critical( options )

Indicates that a [Critical Error](#critical-errors) has occurred, meaning it is not expected to succeed on retry or a different consumer instance. If there is a criticalHandler defined for your Hutch instance that will be called. It will also throw a CriticalMessageError and nack the message for you. It will *not* requeue (retry) the message.

You can set 'throw' to off if you want, but its recommended to keep it as is. Keeping throw in should prevent further execution in the function or promise chain, which would be the desired outcome when recognizing the message cannnot be processed as normal.

Options:

- nack: whether to nack (default=true)
- throw: whether to throw the error or not (default=true)

### controls.catchCritical( error, options )

Drop this into the try/catch or into a catch on a promise chain to simplify handling the error thrown by controls.critical. Just pass the error in to have it properly output and handled (e.g. in cases where a throw could potentially crash your app).

    myPromise.then(() => { 
        // ... Do some work ...
        
        // Something goes wrong
        controls.critical()
        
        // controls.critical will throw
        // So anything after this won't execute

    })
    .catch(err => {
        // If the error is a CriticalMessageError this will handle it and return true
        if(!controls.catchCritical(err)) {
            // If you want to use it as part of a conditional block to handle other error types
        }
    })

If you need to pass it up through multiple promise levels, you can also use it conditionally rethrow. If the error matches the right type, it will throw it again.

    controls.catchCritical(err, { rethrow: true });

### controls.forward( queueName )

Forward the message to another queue. If another queue needs to do some work with this message, or if there is an error that needs to be processed separately. You can either nack or ack the message. If both ack and nack are true, then nack will take priority.

Options:

- ack: whether to ack (defualt=true)
- nack: whether to nack (default=false)

### controls.sendToQueueInCallTree( queueName, otherPayload, options)

Shortcut for using a [Call Tree](#call-trees) for error resolution. If you can send a message to another queue to fix an issue preventing this message from fully succeeding, call that message here. The message will be sent with this one (the original one) being attached in the call tree. If that other message succeeds, it will send the original message again.

These can be chained a few times too using the same methodology. If the message you call with this method also needs to send another message before that one can resolve, it can safely call this method itself and the call tree will retain the original message. Like a recusrive function call, it will resolve back up the stack.

The **throw** option allows you to easily fail this message, since most of the time when using this to resolve an issue preventing this message from succeeding, you cannot continue executing until it is resolved. If you don't pass throw, you'll need to manually stop or skip execution on the remainder of your method(s) yourself some way.

**Options:**

- throw: Pass in a truthy value or an error string to have the function throw an error and nack. If you pass in a string it will be the error message. (default:undefined)

## hutch.consumeQueueMultipart( queue, options, messageFn, doneFn )

Sometimes you may need to wait for other messages to arrive, or may divide a message into multiple parts for easier consumption. Each message is parsed with the messageFn function, which should aggregate or reduce the messages and persist the data elsewhere. messageFn returns a promise which resolves with an object. This object has a "done" property indicating whether all the parts have been received.

The messageFn should determine whether the current message is the "last" message, meaning all messages have been received. 


    hutch.consumeQueueMultipart("my-queue", {...}, 
        function messageFn(data, msg, controls) {
            var allMessagesReceived = false;

            // 1. Evaluate and process the data as needed
            process(data);

            // 2. Fetch any existing aggregation from this batch
            var aggregatedData = fetch();

            // 3. Persist the reduction or aggregation of messages
            save(aggregatedData);

            // 4. return a promise
            if(aggregatedData.messageCount == data.totalBatches) {
                allMessagesReceived = true;
            }
            return Promise.resolve({ done: allMessagesReceived, data: aggregatedData });
        },
        function doneFn(aggregatedData, partResult, controls) {

        }
    )

In general you should try persisting the data about the messages outside of Rabbit and your program's working memory, as you could have more than one consumer, or in the event of failure.

## hutch.startCollector( options )
Starts a new collector that can be used to aggregate data items together for processing in batches.

## hutch.sendCollectorToQueue( queue, collector, options )
Sends the collector's items to the specified queue, with the items split up into batches, one batch per message.

## hutch.sendBatchToQueue(queue, payloadsArray, options)
Sends an array of messages to a queue


## hutch.briefConnect(fn)
Creates a short-lived connection to rabbit which will be closed after the passed in function is finished. If you return a promise from the function, RabbitHutch will wait for the promise to resolve or catch before closing the connection. This will also try to prevent closing a short-lived connection before all functions are resolved when there are multiple briefConnect functions running concurrently.

## Optional Express Integration
You may want to be able to run your functions through a REST call, maybe for testing, or maybe for other purposes.

If you are using express, or an express-like interface, you can pass it in to get URL endpoints automatically generated for each queue.

    // parse application/json (optional)
    app.use(bodyParser.json());

    var hutch = new RabbitHutch("amqp://...", { expressApp: app });
    hutch.connect()
        .then(() => {
            hutch.consumeQueue("my-queue", ...)
        });

    // Now you can use: manually send a message to the queue like so:
    // POST http://<YOUR-DOMAIN>/consume/my-queue

With the express integration, Hutch tries to mimic the normal message queue process as closely as possible, so it is a great way to test your queue consumer functions without having to run the full pipeline.

**Note**: Hutch does not add anything to express, in particular it does not do anything for parsing the body of a POST. If you want to enable this functionality you will have to set up something like [body-parser](https://github.com/expressjs/body-parser) on your express app. The specific setup for your body-parser will depend on how you are posting data to your program.

## Crash handling

RabbitHutch will attempt to clean up its connection to Rabbit in the event of an unrecoverable exception, crash, or program exit.

When creating a new RabbitHutch instance you can toggle this functionality off if you don't want it:

    // Turning crash handling off
    new RabbitHutch("amqp://...", { crashHandling: false });

## Call Trees

Starting in RabbitHutch 2.x, messages sent with a type of hutch-message-v2:wrapped can contain a message call tree. Whereas Rabbit sends "messages" to clients to have certain work get done, a call tree allows a hierarchy of messages to be linked on success.

Suppose you have work for a message that cannot be completed or fails, but it could succeed if you run another message to another queue and wait for that to finish. You could poll for it to finish, but is that queue going to process it soon? Do you just freeze this consumer until then?

You could also write some custom logic and add some additional data to your payload so the other queue knows to send a message back to the original queue once it has succeeded, but that couples the queues together more closely and would require special handling for every case.

So instead, the program working the other queue really doesn't need to have any idea about that there is a call tree. Once it finishes RabbitHutch will evaluate the call tree and take care of any nested messages.

The easiest way to use a call tree in this scenario is to call controls.sendToQueueInCallTree like in the following example:

    consumeQueue("queue-1", function(data, msg, controls) => {
        
        // ... do some work ...


        // Something goes wrong
        if(err) {
            return controls.sendToQueueInCallTree("fix-it-queue", { fixSomething: "a" });
        } else {
            // ... Other normal work ...
        }
    });

controls.sendToQueueInCallTree will ack the message once completed. Even though there was a failure or unhealthy state in processing, the message has been 'handled' and presumably the other queue will reconcile any issues.

You can also interface with callTrees outside of this process by directly adding to a callTree from the message

    consumeQueue("queue-1", function(data, msg, controls) => {
        msg.addToCallTree({ ... data ...}, "ancilliary-queue");

        // ... other work ...

        // Acknowledge the message as normal
        // The call tree will be processed at after ack is called
        controls.ack();
    })

### Call Tree Processing

The callTree on the message currently being consumed is processed when the message is acknowledged (controls.ack). If the current message fails with a nack (and without a requeue), it will handle the rest of the call tree like controls.critical() for each message.

callTree messages can processed in "serial" or in "parallel", which is determined by the "sequence" you pass in on the options argument. If not provided, it will default to "serial".

Each message indicates whether it should be processed serially or in parallel, which can also effect when other messages are processed.

Messages are *always* processed in order, though keep in mind that if the sequence is parallel it doesn't guarantee they will be consumed and executed in the same order by other consumers.

If a message is marked as "serial" then it will be processed, and the remaining messages will remain in the call tree when passed with that message to the next consumer. Parallel messages can be processed at the same time as other parallel messages which form an uninetrrupted sequence in the callTree.

Consider the following diagram. (s) is a serial message, (p) is parallel, and the (-) represents the consumer executing the previous message before continuing on the callTree.

Because messages are processed in order, this means the last parallel message in a sequence of parallel messages will be the one to carry the remaining items in the call tree, if any.

    Example 1. s - s - s - s - s
    Example 2. ppp - s - pp - s - s
    Example 3. ppppp

In Example 1, a serial message is sent, we wait for it to be received, consumed and acknowledged, and then send the next serial message in the queue and so on.

In Example 2, 3 parallel messages in a row are sent, then we wait for the third one to complete before sending a serial message, then wait for that to send 2 paralell messages, and so on.

In example 3, 5 paralell messages are sent and the call tree is finished.

***WARNING***: There is a risk that if you requeue your message on failure you could unneccessarily duplicate callTree messages. There is currently not a built-in protection or resolution for this.

## Message Forwarding

Sometimes you may want another queue to handle the message instead, such as in the case if an unrecoverable error occurred but you don't want to just lose the message. This is accomplished with message forwarding.

    consumeQueue("queue-1", function(data, msg, controls) => {
        
        // ... do some work ...


        // Something goes wrong
        if(err) {
            // There is no method for fixing this automatically, forward it for manual review
            return controls.forward("graveyard");
        } else {
            // ... Other normal work ...
        }
    });

controls.forward will ack the message once completed. Even though there was a failure or unhealthy state in processing, the message has been 'handled' and presumably after manual review can be resolved in the future.

## Message Types

### Raw (Legacy)

Message types were not used in versions prior to 1.1.11. If no type is provided on the message properties then it will assume 'raw', which will assume the entire message.content is data for the consuming function. This is synonymous to hutch-message-v1.

### hutch-message-v2

In version 2 messages have the ability to create a meta data wrapper around messages, or to simply pass messages through directly similar to raw.

#### wrapped

Wrapped is a sub-type of hutch-message-v2. The type string will appear as

    hutch-message-v2:wrapped

This gives access to a lot of new features in RabbitHutch including call trees.

## Critical Errors

In RabbitHutch, if there is a problem which prevents the consumer from correctly completing the processing of a message *and* cannot be resolved by the program in some way, then we call that **CriticalMessageError**.

These types of errors require manual evaluation by a developer or other technical person to assess and resolve and it is inferred that they are guaranteed to fail on a retry, meaning it will not be requeued.

Critical Errors can be thrown with controls.critical() and are handled as follows:

1. Invoke controls.critical()
1. IF a criticalHandler was provided to the Hutch instance, it will be called
1. controls.nack({requeue: false}) is invoked
1. A CriticalMessageError is thrown

### criticalHandler

The criticalHandler is an option you can pass when you first create your RabbitHutch instance. It can either be a string queueName or it can be a function that you pass in.

If it is a queueName, then the errors will simply be passed through to the other queue. If its a function, the HutchMessage will be passed into it when its called.

