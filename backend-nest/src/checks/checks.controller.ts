import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { Response } from 'express';
import { ChecksService } from './checks.service';
import { SITE_CHECKS_QUEUE } from '../queue/queue.constants';
import { DbService } from '../db/db.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthedRequest } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { CheckRateLimitGuard } from './check-rate-limit.guard';
import { SubmitCheckDto } from './dto/submit-check.dto';
import { CreateScheduledCheckDto } from './dto/create-scheduled-check.dto';
import { PdfService } from '../pdf/pdf.service';
import { SeoAuditPdfService } from '../pdf/seo-audit-pdf.service';
import { SubmitSeoAuditDto } from '../seo-audit/dto/submit-seo-audit.dto';

@Controller()
export class ChecksController {
  constructor(
    private readonly checks: ChecksService,
    private readonly db: DbService,
    private readonly pdfService: PdfService,
    private readonly seoAuditPdfService: SeoAuditPdfService,
    @InjectQueue(SITE_CHECKS_QUEUE) private readonly queue: Queue,
  ) {}

  // --- Checks ---

  @Post('api/check')
  @UseGuards(OptionalJwtAuthGuard, CheckRateLimitGuard)
  async submitCheck(@Body() dto: SubmitCheckDto, @Req() req: AuthedRequest) {
    const normalizedUrl = this.checks.normalizeUrl(dto.url);
    if (!normalizedUrl) {
      throw new BadRequestException('Please provide a valid URL');
    }

    const job = await this.queue.add('check-site', {
      url: normalizedUrl,
      userId: req.userId,
      maxPages: dto.maxPages ?? null,
    });

    return { jobId: job.id, status: 'queued' };
  }

  @Get('api/check/:jobId')
  @UseGuards(OptionalJwtAuthGuard)
  async getCheckStatus(@Param('jobId') jobId: string, @Req() req: AuthedRequest) {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.data.userId && job.data.userId !== req.userId) {
      throw new ForbiddenException('Not your job');
    }

    const state = await job.getState();

    if (state === 'completed') {
      return { status: 'completed', report: job.returnvalue };
    }
    if (state === 'failed') {
      return { status: 'failed', error: job.failedReason };
    }
    return { status: state };
  }

  @Delete('api/check/:jobId')
  async cancelCheck(@Param('jobId') jobId: string) {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const state = await job.getState();

    if (state === 'waiting' || state === 'delayed') {
      await job.remove();
    } else {
      await job.updateData({ ...job.data, cancelled: true });
    }
  }

  // --- Reports ---

  @Get('api/reports')
  @UseGuards(JwtAuthGuard)
  async listReports(@Req() req: AuthedRequest) {
    return this.db.getRecentReports(req.userId as number);
  }

  @Get('api/reports/:id')
  @UseGuards(JwtAuthGuard)
  async getReport(@Param('id') id: string, @Req() req: AuthedRequest) {
    const report = await this.db.getReportById(Number(id), req.userId as number);
    if (!report) throw new NotFoundException('Report not found');
    return report;
  }

  @Delete('api/reports/:id')
  @UseGuards(JwtAuthGuard)
  async removeReport(@Param('id') id: string, @Req() req: AuthedRequest) {
    const deleted = await this.db.deleteReport(Number(id), req.userId as number);
    if (!deleted) throw new NotFoundException('Report not found');
  }

  @Get('api/reports/:id/pdf')
  @UseGuards(JwtAuthGuard)
  async getReportPdf(@Param('id') id: string, @Req() req: AuthedRequest, @Res() res: Response) {
    const report = await this.db.getReportById(Number(id), req.userId as number);
    if (!report) throw new NotFoundException('Report not found');

    const user = await this.db.getUserById(req.userId as number);
    const pdfBuffer = await this.pdfService.generatePdf(report, user?.email);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="report-${id}.pdf"`);
    res.send(pdfBuffer);
  }

  // --- Scheduled checks ---

  @Post('api/scheduled-checks')
  @UseGuards(JwtAuthGuard)
  @HttpCode(201)
  async createScheduledCheck(@Body() dto: CreateScheduledCheckDto, @Req() req: AuthedRequest) {
    const normalizedUrl = this.checks.normalizeUrl(dto.url);
    if (!normalizedUrl) throw new BadRequestException('Please provide a valid URL');

    const id = await this.db.createScheduledCheck(req.userId as number, normalizedUrl, dto.intervalType);
    return { id };
  }

  @Get('api/scheduled-checks')
  @UseGuards(JwtAuthGuard)
  async listScheduledChecks(@Req() req: AuthedRequest) {
    return this.db.getScheduledChecksByUser(req.userId as number);
  }

  @Delete('api/scheduled-checks/:id')
  @UseGuards(JwtAuthGuard)
  async removeScheduledCheck(@Param('id') id: string, @Req() req: AuthedRequest) {
    const deleted = await this.db.deleteScheduledCheck(Number(id), req.userId as number);
    if (!deleted) throw new NotFoundException('Scheduled check not found');
  }

  // --- Notifications ---

  @Get('api/notifications')
  @UseGuards(JwtAuthGuard)
  async listNotifications(@Req() req: AuthedRequest) {
    return this.db.getNotificationsByUser(req.userId as number);
  }

  @Post('api/notifications/:id/read')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async markNotificationRead(@Param('id') id: string, @Req() req: AuthedRequest) {
    const updated = await this.db.markNotificationRead(Number(id), req.userId as number);
    if (!updated) throw new NotFoundException('Notification not found');
  }

  // --- SEO audit ---

  @Post('api/seo-audit')
  @UseGuards(OptionalJwtAuthGuard, CheckRateLimitGuard)
  async submitSeoAudit(@Body() dto: SubmitSeoAuditDto, @Req() req: AuthedRequest) {
    const normalizedUrl = this.checks.normalizeUrl(dto.url);
    if (!normalizedUrl) throw new BadRequestException('Please provide a valid URL');

    const job = await this.queue.add('seo-audit', {
      url: normalizedUrl,
      userId: req.userId,
      auditType: 'seo',
      maxPages: dto.maxPages ?? null,
    });

    return { jobId: job.id, status: 'queued' };
  }

  @Get('api/seo-reports')
  @UseGuards(JwtAuthGuard)
  async listSeoAudits(@Req() req: AuthedRequest) {
    return this.db.getRecentSeoAudits(req.userId as number);
  }

  @Get('api/seo-reports/:id')
  @UseGuards(JwtAuthGuard)
  async getSeoAudit(@Param('id') id: string, @Req() req: AuthedRequest) {
    const audit = await this.db.getSeoAuditById(Number(id), req.userId as number);
    if (!audit) throw new NotFoundException('SEO audit not found');
    return audit;
  }

  @Delete('api/seo-reports/:id')
  @UseGuards(JwtAuthGuard)
  async removeSeoAudit(@Param('id') id: string, @Req() req: AuthedRequest) {
    const deleted = await this.db.deleteSeoAudit(Number(id), req.userId as number);
    if (!deleted) throw new NotFoundException('SEO audit not found');
  }

  @Get('api/seo-reports/:id/pdf')
  @UseGuards(JwtAuthGuard)
  async getSeoAuditPdf(@Param('id') id: string, @Req() req: AuthedRequest, @Res() res: Response) {
    const audit = await this.db.getSeoAuditById(Number(id), req.userId as number);
    if (!audit) throw new NotFoundException('SEO audit not found');

    const user = await this.db.getUserById(req.userId as number);
    const pdfBuffer = await this.seoAuditPdfService.generateSeoAuditPdf(audit, user?.email);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="seo-audit-${id}.pdf"`);
    res.send(pdfBuffer);
  }
}