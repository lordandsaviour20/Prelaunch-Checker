require('dotenv').config();
const { checkQueue } = require('./queue');
const { getDueScheduledChecks } = require('./db');

const POLL_INTERVAL_MS = 60 * 1000; 

async function pollAndEnqueue() {
  try {
    const due = await getDueScheduledChecks();
    for (const check of due) {
      console.log(`Enqueuing scheduled check ${check.id} for ${check.url}`);
      await checkQueue.add('check-site', {
        url: check.url,
        userId: check.user_id,
        scheduledCheckId: check.id,
        intervalType: check.interval_type,
      });
    }
  } catch (err) {
    console.error('Scheduler poll failed:', err.message);
  }
}

setInterval(pollAndEnqueue, POLL_INTERVAL_MS);
console.log('Scheduler started, polling every minute for due checks...');
pollAndEnqueue(); 