const amqplib = require("amqplib/callback_api");

const Hutch = require("./src/hutch-base.js");
require("./src/hutch-connection.js");
require("./src/hutch-send.js");
require("./src/hutch-collector.js");
require("./src/consume");



/**
 * @typedef {Object} RabbitHutchOptions
 * @property {string} channel
 * @property {Express} expressApp
 * @property {integer} prefetchLimit
 * @property {boolean} overrideLogger
 * 
 */

/**
 * @typedef {Object} RabbitHutchConsumeControls
 * @property {Function} cancelTimeout - Cancels the Timeout protection, allowing the function to run indefinitely
 * @property {Function} retry - Retries processing the message without requeing it
 * @property {Function} ack - Acknowledges the message
 * @property {Function} nack - Negative Acknowledges the message (processing failed)
 */


 /**
  * @typedef {Function} RabbitHutchConsumeCallback
  * @param {*} obj 
  * @param {RabbitMQ.Message} msg fn(obj, msg, controls);
  * @param {RabbitHutchConsumeControls} controls
  */





module.exports = Hutch;