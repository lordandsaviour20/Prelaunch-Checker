import { Module } from '@nestjs/common';
import { SeoAuditService } from './seo-audit.service';

@Module({
  providers: [SeoAuditService],
  exports: [SeoAuditService],
})
export class SeoAuditModule {}