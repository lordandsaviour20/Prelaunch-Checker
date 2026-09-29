import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
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

@Injectable()
@Processor(SITE_CHECKS_QUEUE)
export class ChecksProcessor extends WorkerHost {
  private readonly logger = new Logger(ChecksProcessor.name);

  constructor(@InjectQueue(SITE_CHECKS_QUEUE) private readonly queue: Queue) {
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
    const { url, maxPages, auditType } = job.data;

    if (auditType === 'seo') {
      this.logger.log(
        `Processing job ${job.id} for ${url} (SEO audit${maxPages ? `, crawl max ${maxPages} pages` : ''})`,
      );
      if (await this.isJobCancelled(String(job.id))) {
        throw new ScanCancelledError();
      }
      // TODO (4d/4e): port seo-audit.js and db.js, then fill this branch in
      throw new Error('SEO audit branch not ported yet');
    }

    this.logger.log(
      `Processing job ${job.id} for ${url}${maxPages ? ` (crawl, max ${maxPages} pages)` : ''}`,
    );
    if (await this.isJobCancelled(String(job.id))) {
      throw new ScanCancelledError();
    }
    // TODO (4c continued): call ChecksService/CrawlChecksService, then
    // port db.js, diff.js, email.js to fill in the save/notify logic
    throw new Error('Check/crawl branch not fully ported yet');
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