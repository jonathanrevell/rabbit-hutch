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
    toBuffer() {
        var str;
        if(this.type.base === "raw" || (this.type.base === "hutch-message" && this.type.version === 1)) {
            str = JSON.stringify(this.data);
            return Buffer.from(str);
        } else if(this.type.base === "hutch-message" && this.type.version >= 2) {
            if(this.type.hasSubType('wrapped')) {
                var wrapper = {
                    callTree: this.callTree,
                    data: this.data
                };
                str = JSON.stringify(wrapper);
                return Buffer.from(str);
            } else {
                str = JSON.stringify(this.data);
                return Buffer.from(str);
            }
        } else {
            throw new Error("Unrecognized message type: " + this.raw.properties.type);
        }

    },
    sendOnChannel(channel, queue) {
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
        return JSON.stringify(this.data);
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
    }
};

function MessageType(typeString) {
    typeString = typeString.toLowerCase();
    if(!typeString || typeString === "raw") {
        this.base = "raw";
        this.version = 1;
    }
    var parts = [];
    var basePart;
    if(typeString.indexOf(":") >= 0) {
        parts = typeString.split(":");
        basePart = parts[0];
        parts.shift();
        this.subTypes = parts;
    } else {
        basePart = typeString;
        this.subTypes = null;
    }
    var versionMatch = VERSION_REGEX.match(basePart);
    if(versionMatch && versionMatch.length > 1) {
        this.version = parseInt(versionMatch[1]);
        this.base = basePart.replace(versionMatch[0], "");
    } else {
        this.version = 0;
        this.base = basePart;
    }
}

MessageType.prototype.hasSubType = function(str) {
    return (this.subTypes.indexOf(str) >= 0);
};
MessageType.prototype.assertSubType = function(str) {
    if(!this.hasSubType(str)) {
        this.subTypes.push(str);
    }
}
MessageType.prototype.toString = function() {
    var baseString = `${this.base}-v${this.version}`;
    if(this.subTypes) {
        return `${baseString}:${this.subTypes.join(':')}`;
    } else {
        return baseString;
    }   
}


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
