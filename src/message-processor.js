const DEFAULT_MESSAGE_TYPE = "hutch-message-v2";
const VERSION_REGEX = /-v([0-9]+)$/i;

/**
 * @class HutchMessage
 * A more user-friendly, robust message with some utilities
 * for converting data back and forth
 */
function HutchMessage() {
    this.type       = null;
    this.raw        = null;
    this.data       = null;
    this.callTree   = null;
    this.attempts   = 0;        // Counts the number of times this message has been attempted
}

HutchMessage.prototype = {
    toAmqLikeMessage() {
        return {
            content: this.data,
            properties: {
                type: this.type.toString(),
                headers: this.raw.properties.headers || {}
            },
            fields: {}
        };
    },
    rebuildRaw() {
        return this.raw;
    },
    toBuffer() {
        return Buffer.from( this.toString() );
    },
    sendOnChannel(channel, queue, options={}) {
        console.log(`Sending to queue ${queue}`, this.summaryString());

        channel.sendToQueue(queue, this.toBuffer(), { 
            headers: this.raw.properties.headers,
            type: this.type.toString()
        }); 
    },
    summaryString() {
        return this.toString().substring(0,50);
    },
    toString() {
        if(this.type.base === "raw" || (this.type.base === "hutch-message" && this.type.version === 1)) {
            return JSON.stringify(this.data);
        } else if(this.type.base === "hutch-message" && this.type.version >= 2) {
            if(this.type.hasSubType('wrapped')) {
                var wrapper = {
                    callTree: this.callTree,
                    data: this.data
                };
                return JSON.stringify(wrapper);
            } else {
                return JSON.stringify(this.data);
            }
        } else {
            throw new Error("Unrecognized message type: " + this.raw.properties.type);
        }
    },
    getHeader(header) {
        try {
            return this.raw.properties.headers[header];
        } catch(err) {
            console.error(err);
            return undefined;
        }
    },
    setHeader(header, value) {
        if(!this.raw.properties.headers) {
            this.raw.properties.headers = {};
        }
        this.raw.properties.headers[header] = value;
    },
    addToCallTree(message, queueName, options={}) {
        this.type.assertSubType("wrapped");
        if(!this.callTree) {
            this.callTree = [];
        }

        message.setHeader("call-tree-member", true);
        message.setHeader("queue-name", queueName);
        message.setHeader("call-sequence", options.sequence || "serial");
        var amqMessage = message.toAmqLikeMessage();

        this.callTree.unshift(amqMessage);
    },
    clearCallTree() {
        this.callTree = [];
    }
};
exports.HutchMessage = HutchMessage;

function MessageType(typeString) {
    typeString = typeString ? typeString.toLowerCase() : undefined;
    this.subTypes = [];
    if(!typeString || typeString === "raw") {
        this.base = "raw";
        this.version = 1;
        
        
    } else {
        var parts = [];
        var basePart;
        if(typeString.indexOf(":") >= 0) {
            parts = typeString.split(":");
            basePart = parts[0];
            parts.shift();
            this.subTypes = parts;
        } else {
            basePart = typeString;
        }
        var versionMatch = basePart.match(VERSION_REGEX);
        if(versionMatch && versionMatch.length > 1) {
            this.version = parseInt(versionMatch[1]);
            this.base = basePart.replace(versionMatch[0], "");
        } else {
            this.version = 0;
            this.base = basePart;
        }
    }
}

MessageType.prototype.hasSubType = function(str) {
    return (this.subTypes.indexOf(str) >= 0);
};
MessageType.prototype.assertSubType = function(str) {
    if(this.base === "raw" || !this.base) {
        throw new Error("raw messages do not support sub types");
    }
    if(!this.hasSubType(str)) {
        this.subTypes.push(str);
    }
};
MessageType.prototype.toString = function() {
    var baseString = `${this.base}-v${this.version}`;
    if(this.subTypes) {
        return `${baseString}:${this.subTypes.join(':')}`;
    } else {
        return baseString;
    }   
};

function parseAmqLikeMessage(amqLikeMessage) {
    var msg     = new HutchMessage();
    msg.raw     = amqLikeMessage;

    msg.data    = amqLikeMessage.content;
    msg.type = new MessageType(rawMessage.properties.type);
    return msg;
}
exports.parseAmqLikeMessage = parseAmqLikeMessage;


function parseAmqMessage(rawMessage) {
    var msg     = new HutchMessage();
    msg.raw     = rawMessage;
    var msgStr  = rawMessage.content.toString();

    msg.type = new MessageType(rawMessage.properties.type);
    
    if(msg.type.base === "raw" || (msg.type.base === "hutch-message" && msg.type.version === 1)) {
        msg.data = JSON.parse(msgStr);
    } else if(msg.type.base === "hutch-message" && msg.type.version >= 2) {
        if(msg.type.hasSubType('wrapped')) {
            var wrapper     = JSON.parse(msgStr);
            msg.callTree    = wrapper.callTree;
            msg.attempts    = msg.getHeader("attempts") || 1;
            msg.data        = wrapper.data;
        } else {
            msg.data = JSON.parse(msgStr);
        }
    } else {
        throw new Error("Unrecognized message type: " + rawMessage.properties.type);
    }
    return msg;
}
exports.parseAmqMessage = parseAmqMessage;

function assertMessage(payload) {
    if(payload instanceof HutchMessage) {
        return payload;
    } else {
        return messageFromData(payload);
    }
}
exports.assertMessage = assertMessage;

function messageFromData(data) {
    var msg     = new HutchMessage();
    msg.data    = data;
    msg.type    = new MessageType("raw");
    msg.raw     = {
        content: msg.data,
        properties: {
            type: "raw"
        },
        fields: {}
    };

    return msg;
}
exports.messageFromData = messageFromData;

function sendDataOnChannel(channel, queue, data, options) {
    if(options === undefined) {
        options = {};
    }
    var type = options.type || DEFAULT_MESSAGE_TYPE;
    var msg     = new HutchMessage();
    msg.data    = data;
    msg.type    = new MessageType(type);

    msg.raw     = {
        content: msg.data,
        properties: {
            type: type
        },
        fields: {}
    };

    if(options.callTree) {
        msg.type.assertSubType("wrapped");
        msg.callTree = options.callTree;
    }



    return msg.sendOnChannel(channel, queue);
}
exports.sendDataOnChannel = sendDataOnChannel;

// For publishing messages on a channel
// options.type
// options.headers


// For Received Messages
// message.properties.type
// message.properties.headers




// http://www.squaremobius.net/amqp.node/channel_api.html#channel_consume
/**
 * Message Data Structure from AMQLIB 
 * {
        content: Buffer,
        fields: Object,
        properties: Object
    }
 */
