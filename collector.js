function Batch() {
    this.items = [];
}
Batch.prototype = {
    get count() {
        return this.items.length;
    },
    add: function( item ) {
        this.items.push(item);
    }
};

/**
 * @typedef CollectorOptions
 * @property {integer} sizeLimit - the maximum items per batch
 * @property {String} itemsName - the name that is given to the items when sent to a queue
 */

/**
 * Aggregates data items to be processed or queued in batches
 * @class Collector
 * @param {CollectorOptions} options
 */
function Collector(options) {
    if(!options) {
        options = {};
    }
    this.id        = `${Math.random() * 10000}`.replace('.','').substr(0,7);
    this.sizeLimit = options.sizeLimit || 50;
    this.itemsName = options.itemsName || "items";
    this.counter   = 0;

    this.batches = [];
    this.newBatch();
}

Collector.prototype = {
    /**
     * Adds an item to the collector, automatically adding it to the batch
     * @param {*} item 
     */
    add: function(item) {
        if(this.activeBatch.count >= this.sizeLimit) {
            this.newBatch();
        }
        this.counter++;
        this.activeBatch.add(item);
    },

    /**
     * Returns the number of batches in the collector
     */
    get batchCount() {
        return this.batches.length;
    },

    /**
     * @private
     * Starts a new batch. You can call this from outside the object, but you should never need to
     */
    newBatch: function() {
        var batch = new Batch();
        this.batches.push(batch);
        this.activeBatch = batch;
    },
    /**
     * Runs a map function with all the items in each batch
     * @param {*} fn 
     */
    map: function( fn ) {
        var results = [];
        for(var i = 0; i < this.batches.length; i++) {
            var batch = this.batches[i];
            results.push( fn(batch, i) );
        }

        return results;
    },
    /**
     * Iterates through each batch with a function
     * @param {*} fn 
     */
    forEach: function( fn ) {
        for(var i = 0; i < this.batches.length; i++) {
            var batch = this.batches[i];
            fn(batch, i);
        }
    }
};

module.exports = Collector;