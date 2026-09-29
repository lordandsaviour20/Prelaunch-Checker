import { Module } from '@nestjs/common';
import { ChecksController } from './checks.controller';
import { ChecksService } from './checks.service';
import { CrawlChecksService } from './crawl-checks.service';
import { CrawlerService } from './crawler.service';
import { SsrfGuardService } from './ssrf-guard.service';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [QueueModule],
  controllers: [ChecksController],
  providers: [
    ChecksService,
    SsrfGuardService,
    CrawlerService,
    CrawlChecksService,
  ],
  exports: [
    ChecksService,
    SsrfGuardService,
    CrawlerService,
    CrawlChecksService,
  ],
})
export class ChecksModule {}