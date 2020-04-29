const {parseAmqLikeMessage} = require("../message-processor.js");

function processCallTree(hutch, message) {
    if(message.callTree && message.callTree.length > 0) {
        console.log("Processing messages in call tree");
        var readyMessages = [];

        // The first message will always be processed regardless of sequence
        readyMessages.push( message.callTree.shift() );

        // Determine how many messages to send now
        while(message.callTree.length > 0) {
            var sequence = message.callTree[0].properties.headers["call-sequence"];
            
            if(sequence === "serial") {
                break;
            }
            readyMessages.push( message.callTree.shift() );
        }

        // Parse and send the messages
        for(let i = 0; i < readyMessages.length; i++) {
            var sub = parseAmqLikeMessage(readyMessages[i]);
            if(i === readyMessages.length - 1) {
                // On the last message, send it with the remaining callTree (if any)
                sub.callTree = message.callTree;
            }
            hutch.sendToQueue(sub.getHeader("queue-name"), sub);
        }
    }
}
exports.processCallTree = processCallTree;