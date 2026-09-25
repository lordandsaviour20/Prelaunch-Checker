require('dotenv').config();
const { findNewlyFailedChecks } = require('./diff');
const { sendAlertEmail } = require('./email');
const { getUserById, createNotification } = require('./db');

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    console.error('Usage: node test-alert.js <user_id>');
    process.exit(1);
  }

  // fake "before" report — everything passing
  const previousReport = {
    checks: {
      accessible: { status: 'pass' },
      ssl: { status: 'pass' },
      viewport: { status: 'pass' },
    },
  };

  // fake "after" report — ssl and viewport now failing
  const newReport = {
    url: 'https://example.com',
    checks: {
      accessible: { status: 'pass' },
      ssl: { status: 'fail' },
      viewport: { status: 'fail' },
    },
  };

  const newlyFailed = findNewlyFailedChecks(previousReport, newReport);
  console.log('Newly failed:', newlyFailed);

  if (newlyFailed.length === 0) {
    console.log('Diff found nothing — something is wrong with the diff logic itself.');
    process.exit(0);
  }

  const message = `New issues found on ${newReport.url}: ${newlyFailed.join(', ')}`;
  await createNotification(userId, message);
  console.log('Notification created.');

  const user = await getUserById(userId);
  if (user?.email) {
    await sendAlertEmail(user.email, { url: newReport.url, failedChecks: newlyFailed });
    console.log(`Alert email sent to ${user.email}`);
  } else {
    console.log('No user/email found for that ID.');
  }

  process.exit(0);
}

main();