import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DbService } from '../db/db.service';
import { SITE_CHECKS_QUEUE } from './queue.constants';

const POLL_INTERVAL_MS = 60 * 1000;

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly db: DbService,
    @InjectQueue(SITE_CHECKS_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.logger.log('Scheduler started, polling every minute for due checks...');
    void this.pollAndEnqueue();
  }

  @Interval(POLL_INTERVAL_MS)
  async pollAndEnqueue() {
    try {
      const due = await this.db.getDueScheduledChecks();
      for (const check of due) {
        this.logger.log(`Enqueuing scheduled check ${check.id} for ${check.url}`);
        await this.queue.add('check-site', {
          url: check.url,
          userId: check.user_id,
          scheduledCheckId: check.id,
          intervalType: check.interval_type,
        });
      }
    } catch (err) {
      this.logger.error(`Scheduler poll failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}