function validateQueueName(name) {
    if(name === undefined || name === null) {
        throw new Error("Queue name cannot be null or undefined");
    }
    if(typeof name !== "string") {
        console.log(name);
        throw new Error("Queue name must be a string");
    }
    if(name.length < 1) {
        throw new Error("Queue name cannot be an empty string");
    }
}
module.exports.validateQueueName = validateQueueName;