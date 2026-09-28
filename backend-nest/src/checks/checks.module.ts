import { Module } from '@nestjs/common';
import { ChecksController } from './checks.controller';
import { ChecksService } from './checks.service';
import { CrawlerService } from './crawler.service';
import { SsrfGuardService } from './ssrf-guard.service';

@Module({
  controllers: [ChecksController],
  providers: [ChecksService, SsrfGuardService, CrawlerService],
  exports: [ChecksService, SsrfGuardService, CrawlerService],
})
export class ChecksModule {}