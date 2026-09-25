const { Queue } = require('bullmq');

const connection = { host: 'localhost', port: 6379 };

const checkQueue = new Queue('site-checks', { connection });

module.exports = { checkQueue, connection };