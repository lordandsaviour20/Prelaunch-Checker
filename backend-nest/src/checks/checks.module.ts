import { Module } from '@nestjs/common';
import { ChecksController } from './checks.controller';
import { ChecksService } from './checks.service';
import { CrawlChecksService } from './crawl-checks.service';
import { CrawlerService } from './crawler.service';
import { SsrfGuardService } from './ssrf-guard.service';
import { QueueModule } from '../queue/queue.module';
import { DbModule } from '../db/db.module';
import { DiffService } from '../db/diff.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { SeoAuditModule } from '../seo-audit/seo-audit.module';
import { ChecksProcessor } from '../queue/checks.processor';

@Module({
  imports: [QueueModule, DbModule, NotificationsModule, SeoAuditModule],
  controllers: [ChecksController],
  providers: [
    ChecksService,
    SsrfGuardService,
    CrawlerService,
    CrawlChecksService,
    DiffService,
    ChecksProcessor,
  ],
  exports: [
    ChecksService,
    SsrfGuardService,
    CrawlerService,
    CrawlChecksService,
    DiffService,
  ],
})
export class ChecksModule {}