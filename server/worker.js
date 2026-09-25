const { Worker } = require('bullmq');
const { runAllChecks, runCrawlChecks } = require('./checks');
const { runSeoAudit, runSeoAuditCrawl } = require('./seo-audit');
const { connection, checkQueue } = require('./queue');
const {
  saveReport, saveSeoAudit, getPreviousReport, getUserById, createNotification, markScheduledCheckRun,
} = require('./db');
const { findNewlyFailedChecks } = require('./diff');
const { sendAlertEmail } = require('./email');

class ScanCancelledError extends Error {
  constructor() {
    super('Scan cancelled by user');
    this.name = 'ScanCancelledError';
  }
}

async function isJobCancelled(jobId) {
  try {
    const fresh = await checkQueue.getJob(jobId);
    return !!fresh?.data?.cancelled;
  } catch (err) {
    console.error(`Failed to check cancellation state for job ${jobId}:`, err.message);
    return false;
  }
}

const worker = new Worker(
  'site-checks',
  async (job) => {
    const { url, userId, scheduledCheckId, intervalType, maxPages, auditType } = job.data;

    // --- SEO audit branch - separate from the regular check/crawl flow below ---
    if (auditType === 'seo') {
      console.log(`Processing job ${job.id} for ${url} (SEO audit${maxPages ? `, crawl max ${maxPages} pages` : ''})`);

      if (await isJobCancelled(job.id)) {
        throw new ScanCancelledError();
      }

      let audit;
      try {
        audit = maxPages
          ? await runSeoAuditCrawl(url, maxPages)
          : await runSeoAudit(url);
      } catch (err) {
        console.error(`SEO audit failed for ${url}: ${err.message}`);
        throw err;
      }

      if (await isJobCancelled(job.id)) {
        throw new ScanCancelledError();
      }

      try {
        const auditId = await saveSeoAudit(audit, userId);
        audit.id = auditId;
      } catch (err) {
        console.error('Failed to save SEO audit to database:', err.message);
      }

      return audit;
    }

    // --- Regular check / crawl flow (unchanged) ---
    console.log(`Processing job ${job.id} for ${url}${maxPages ? ` (crawl, max ${maxPages} pages)` : ''}`);

    if (await isJobCancelled(job.id)) {
      throw new ScanCancelledError();
    }

    let report;
    try {
      report = maxPages
        ? await runCrawlChecks(url, maxPages)
        : await runAllChecks(url);
    } catch (err) {
      console.error(`Check blocked or failed for ${url}: ${err.message}`);
      throw err;
    }

    if (await isJobCancelled(job.id)) {
      throw new ScanCancelledError();
    }

    try {
      const previousReport = userId ? await getPreviousReport(userId, url, report.checkedAt) : null;

      const reportId = await saveReport(report, userId);
      report.id = reportId;

      if (scheduledCheckId && userId) {
        const newlyFailed = findNewlyFailedChecks(previousReport, report);
        console.log(`Diff result for ${url}: ${newlyFailed.length > 0 ? newlyFailed.join(', ') : 'no newly failed checks'}`);

        if (newlyFailed.length > 0) {
          const message = `New issues found on ${url}: ${newlyFailed.join(', ')}`;
          await createNotification(userId, message, { scheduledCheckId, reportId });

          const user = await getUserById(userId);
          if (user?.email) {
            await sendAlertEmail(user.email, { url, failedChecks: newlyFailed });
          }
        }

        await markScheduledCheckRun(scheduledCheckId, intervalType);
      }
    } catch (err) {
      console.error('Failed to save report to database:', err.message);
    }

    return report;
  },
  { connection }
);

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  if (err.name === 'ScanCancelledError') {
    console.log(`Job ${job.id} cancelled by user`);
  } else {
    console.error(`Job ${job.id} failed:`, err.message);
  }
});

console.log('Worker started, waiting for jobs...');