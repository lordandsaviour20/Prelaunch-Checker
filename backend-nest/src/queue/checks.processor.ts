import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { ChecksService } from '../checks/checks.service';
import { CrawlChecksService } from '../checks/crawl-checks.service';
import { RunAllChecksResult, RunCrawlChecksResult } from '../checks/checks.types';
import { DbService } from '../db/db.service';
import { DiffService } from '../db/diff.service';
import { EmailService } from '../notifications/email.service';
import {
  SeoAuditCrawlReport,
  SeoAuditReport,
} from '../seo-audit/seo-audit.types';
import { SeoAuditService } from '../seo-audit/seo-audit.service';
import { SITE_CHECKS_QUEUE } from './queue.constants';
import { ScanCancelledError } from './scan-cancelled.error';

export interface CheckJobData {
  url: string;
  userId?: number;
  scheduledCheckId?: number;
  intervalType?: string;
  maxPages?: number;
  auditType?: string;
  cancelled?: boolean;
}

type ReportWithId = (RunAllChecksResult | RunCrawlChecksResult) & { id?: number };
type AuditWithId = (SeoAuditReport | SeoAuditCrawlReport) & { id?: number };

@Injectable()
@Processor(SITE_CHECKS_QUEUE)
export class ChecksProcessor extends WorkerHost {
  private readonly logger = new Logger(ChecksProcessor.name);

  constructor(
    @InjectQueue(SITE_CHECKS_QUEUE) private readonly queue: Queue,
    private readonly checksService: ChecksService,
    private readonly crawlChecksService: CrawlChecksService,
    private readonly db: DbService,
    private readonly diffService: DiffService,
    private readonly emailService: EmailService,
    private readonly seoAuditService: SeoAuditService,
  ) {
    super();
  }

  private async isJobCancelled(jobId: string): Promise<boolean> {
    try {
      const fresh = await this.queue.getJob(jobId);
      return !!(fresh?.data as CheckJobData | undefined)?.cancelled;
    } catch (err) {
      this.logger.error(
        `Failed to check cancellation state for job ${jobId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }
  }

  async process(job: Job<CheckJobData>): Promise<unknown> {
    const { url, userId, scheduledCheckId, intervalType, maxPages, auditType } = job.data;
    const jobId = String(job.id);

    // --- SEO audit branch - separate from the regular check/crawl flow below ---
    if (auditType === 'seo') {
      this.logger.log(
        `Processing job ${job.id} for ${url} (SEO audit${maxPages ? `, crawl max ${maxPages} pages` : ''})`,
      );

      if (await this.isJobCancelled(jobId)) {
        throw new ScanCancelledError();
      }

      let audit: AuditWithId;
      try {
        audit = maxPages
          ? await this.seoAuditService.runSeoAuditCrawl(url, maxPages)
          : await this.seoAuditService.runSeoAudit(url);
      } catch (err) {
        this.logger.error(
          `SEO audit failed for ${url}: ${err instanceof Error ? err.message : String(err)}`,
        );
        throw err;
      }

      if (await this.isJobCancelled(jobId)) {
        throw new ScanCancelledError();
      }

      try {
        const auditId = await this.db.saveSeoAudit(audit, userId ?? null);
        audit.id = auditId;
      } catch (err) {
        this.logger.error(
          `Failed to save SEO audit to database: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      return audit;
    }

    // --- Regular check / crawl flow (unchanged) ---
    this.logger.log(
      `Processing job ${job.id} for ${url}${maxPages ? ` (crawl, max ${maxPages} pages)` : ''}`,
    );

    if (await this.isJobCancelled(jobId)) {
      throw new ScanCancelledError();
    }

    let report: ReportWithId;
    try {
      report = maxPages
        ? await this.crawlChecksService.runCrawlChecks(url, maxPages)
        : await this.checksService.runAllChecks(url);
    } catch (err) {
      this.logger.error(
        `Check blocked or failed for ${url}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }

    if (await this.isJobCancelled(jobId)) {
      throw new ScanCancelledError();
    }

    try {
      const previousReport = userId
        ? await this.db.getPreviousReport(userId, url, report.checkedAt)
        : null;

      const reportId = await this.db.saveReport(report, userId ?? null);
      report.id = reportId;

      if (scheduledCheckId && userId) {
        const newlyFailed = this.diffService.findNewlyFailedChecks(previousReport, report);
        this.logger.log(
          `Diff result for ${url}: ${newlyFailed.length > 0 ? newlyFailed.join(', ') : 'no newly failed checks'}`,
        );

        if (newlyFailed.length > 0) {
          const message = `New issues found on ${url}: ${newlyFailed.join(', ')}`;
          await this.db.createNotification(userId, message, { scheduledCheckId, reportId });

          const user = await this.db.getUserById(userId);
          if (user?.email) {
            await this.emailService.sendAlertEmail(user.email, { url, failedChecks: newlyFailed });
          }
        }

        if (intervalType) {
          await this.db.markScheduledCheckRun(scheduledCheckId, intervalType);
        }
      }
    } catch (err) {
      this.logger.error(
        `Failed to save report to database: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return report;
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    if (err.name === 'ScanCancelledError') {
      this.logger.log(`Job ${job.id} cancelled by user`);
    } else {
      this.logger.error(`Job ${job.id} failed: ${err.message}`);
    }
  }
}