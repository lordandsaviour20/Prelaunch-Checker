require('dotenv').config();
const { checkQueue } = require('./queue');
const { getScheduledChecksByUser, pool } = require('./db');

async function main() {
  const scheduledCheckId = process.argv[2];
  if (!scheduledCheckId) {
    console.error('Usage: node test-scheduled-check.js <scheduled_check_id>');
    process.exit(1);
  }

  const [rows] = await pool.query('SELECT * FROM scheduled_checks WHERE id = ?', [scheduledCheckId]);
  const check = rows[0];
  if (!check) {
    console.error(`No scheduled check found with id ${scheduledCheckId}`);
    process.exit(1);
  }

  console.log(`Enqueuing test run for scheduled check ${check.id}: ${check.url}`);
  await checkQueue.add('check-site', {
    url: check.url,
    userId: check.user_id,
    scheduledCheckId: check.id,
    intervalType: check.interval_type,
  });

  console.log('Job enqueued. Check the worker terminal for progress.');
  process.exit(0);
}

main();