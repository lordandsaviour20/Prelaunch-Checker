require('dotenv').config();
const { deleteOldReports } = require('./db');

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; 

async function runCleanup() {
  try {
    const deleted = await deleteOldReports();
    console.log(`Cleanup: deleted ${deleted} report(s) older than 30 days`);
  } catch (err) {
    console.error('Cleanup failed:', err.message);
  }
}

setInterval(runCleanup, CLEANUP_INTERVAL_MS);
console.log('Cleanup process started, running once a day...');
runCleanup(); 