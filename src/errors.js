class CriticalMessageError extends Error {
    constructor(message="A Critical error occurred while processing a message") {
        super(message);
        this.name = "CriticalMessageError";
    }
}
exports.CriticalMessageError = CriticalMessageError;

class PendingResolutionError extends Error {
    constructor(message="An error occured which the system may be resolving itself") {
        super(message);
        this.name = "PendingResolutionError";
    }
}
exports.PendingResolutionError = PendingResolutionError;