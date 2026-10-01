import { Module } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { SeoAuditPdfService } from './seo-audit-pdf.service';

@Module({
  providers: [PdfService, SeoAuditPdfService],
  exports: [PdfService, SeoAuditPdfService],
})
export class PdfModule {}