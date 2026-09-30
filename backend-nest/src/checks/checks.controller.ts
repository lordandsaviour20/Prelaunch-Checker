import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import * as cheerio from 'cheerio';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ChecksService } from './checks.service';
import { CrawlerService } from './crawler.service';
import { CrawlChecksService } from './crawl-checks.service';
import { SITE_CHECKS_QUEUE } from '../queue/queue.constants';
import { DbService } from '../db/db.service';
import { DiffService } from '../db/diff.service';
import { EmailService } from '../notifications/email.service';
import { SeoAuditService } from '../seo-audit/seo-audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthedRequest } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { CheckRateLimitGuard } from './check-rate-limit.guard';
import { SubmitCheckDto } from './dto/submit-check.dto';

@Controller('checks')
export class ChecksController {
  constructor(
    private readonly checks: ChecksService,
    private readonly crawler: CrawlerService,
    private readonly crawlChecks: CrawlChecksService,
    private readonly db: DbService,
    private readonly diff: DiffService,
    private readonly emailService: EmailService,
    private readonly seoAudit: SeoAuditService,
    @InjectQueue(SITE_CHECKS_QUEUE) private readonly queue: Queue,
  ) {}

  @Post('api-check')
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

  @Get('api-check/:jobId')
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

  @Delete('api-check/:jobId')
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

  @Get('test')
  async test(@Query('url') url: string) {
    const normalized = this.checks.normalizeUrl(url);
    if (!normalized) throw new BadRequestException('Invalid URL');
    const { html, ...rest } = await this.checks.checkAccessible(normalized);
    return { url: normalized, ...rest, htmlLength: html?.length ?? 0 };
  }

  @Get('html-test')
  async htmlTest(@Query('url') url: string) {
    const normalized = this.checks.normalizeUrl(url);
    if (!normalized) throw new BadRequestException('Invalid URL');
    const accessible = await this.checks.checkAccessible(normalized);
    if (!accessible.html) return { error: 'Page not reachable', accessible };
    const $ = cheerio.load(accessible.html);
    return {
      title: this.checks.checkTitle($),
      metaDescription: this.checks.checkMetaDescription($),
      viewport: this.checks.checkViewport($),
      imagesAlt: this.checks.checkImagesAlt($),
    };
  }

  @Get('site-test')
  async siteTest(@Query('url') url: string) {
    const normalized = this.checks.normalizeUrl(url);
    if (!normalized) throw new BadRequestException('Invalid URL');
    const robots = await this.checks.checkRobotsTxt(normalized);
    const sitemap = await this.checks.checkSitemap(normalized, robots.content);
    const ssl = await this.checks.checkSSL(new URL(normalized).hostname);
    const { content, ...robotsRest } = robots;
    return { robots: { ...robotsRest, contentLength: content?.length ?? 0 }, sitemap, ssl };
  }

  @Get('links-test')
  async linksTest(@Query('url') url: string) {
    const normalized = this.checks.normalizeUrl(url);
    if (!normalized) throw new BadRequestException('Invalid URL');
    const accessible = await this.checks.checkAccessible(normalized);
    if (!accessible.html) return { error: 'Page not reachable', accessible };
    const $ = cheerio.load(accessible.html);
    return this.checks.checkBrokenLinks($, normalized);
  }

  @Get('ai-test')
  async aiTest(@Query('url') url: string) {
    const normalized = this.checks.normalizeUrl(url);
    if (!normalized) throw new BadRequestException('Invalid URL');
    const accessible = await this.checks.checkAccessible(normalized);
    if (!accessible.html) return { error: 'Page not reachable', accessible };
    const $ = cheerio.load(accessible.html);
    const robots = await this.checks.checkRobotsTxt(normalized);
    return {
      aiCrawlerAccess: this.checks.checkAiCrawlerAccess(normalized, robots.content),
      structuredData: this.checks.checkStructuredData($),
      llmsTxt: await this.checks.checkLlmsTxt(normalized),
      semanticHtml: this.checks.checkSemanticHtml($),
      jsDependence: this.checks.checkJsDependence($),
      antiBotAccess: await this.checks.checkAntiBotAccess(normalized),
    };
  }

  @Get('run')
  async run(@Query('url') url: string) {
    const normalized = this.checks.normalizeUrl(url);
    if (!normalized) throw new BadRequestException('Invalid URL');
    return this.checks.runAllChecks(normalized);
  }

  @Get('crawl-test')
  async crawlTest(@Query('url') url: string, @Query('max') max = '3') {
    const normalized = this.checks.normalizeUrl(url);
    if (!normalized) throw new BadRequestException('Invalid URL');
    const maxPages = Math.min(Number(max) || 3, 10);
    const pages = await this.crawler.crawlSite(normalized, maxPages);
    return pages.map((p) => ({
      url: p.url,
      statuses: Object.fromEntries(
        Object.entries(p.checks).map(([key, value]) => [key, value.status]),
      ),
    }));
  }

  @Get('run-crawl')
  async runCrawl(@Query('url') url: string, @Query('max') max = '3') {
    const normalized = this.checks.normalizeUrl(url);
    if (!normalized) throw new BadRequestException('Invalid URL');
    const maxPages = Math.min(Number(max) || 3, 10);
    return this.crawlChecks.runCrawlChecks(normalized, maxPages);
  }

  @Get('queue-test')
  async queueTest(@Query('url') url: string, @Query('userId') userId?: string) {
    const normalized = this.checks.normalizeUrl(url);
    if (!normalized) throw new BadRequestException('Invalid URL');
    const job = await this.queue.add('check', {
      url: normalized,
      userId: userId ? Number(userId) : undefined,
    });
    return { jobId: job.id, message: 'Job added, check the terminal logs' };
  }

  @Get('db-test')
  async dbTest() {
    const user = await this.db.getUserById(1);
    return { connected: true, sampleUser: user };
  }

  @Get('db-test2')
  async dbTest2() {
    const due = await this.db.getDueScheduledChecks();
    const notifications = await this.db.getNotificationsByUser(1);
    return { dueCount: due.length, notificationCount: notifications.length };
  }

  @Get('diff-test')
  diffTest() {
    const previous = { checks: { ssl: { status: 'pass' }, title: { status: 'fail' } } };
    const current = { checks: { ssl: { status: 'fail' }, title: { status: 'fail' } } };
    return this.diff.findNewlyFailedChecks(previous as never, current as never);
  }

  @Get('email-test')
  async emailTest() {
    await this.emailService.sendAlertEmail('your-email@example.com', {
      url: 'https://example.com',
      failedChecks: ['SSL Certificate', 'Page Title'],
    });
    return { sent: 'check your inbox (and the terminal for errors)' };
  }

  @Get('seo-meta-test')
  async seoMetaTest(@Query('url') url: string) {
    const normalized = this.checks.normalizeUrl(url);
    if (!normalized) throw new BadRequestException('Invalid URL');
    const accessible = await this.checks.checkAccessible(normalized);
    if (!accessible.html) return { error: 'Page not reachable' };
    const $ = cheerio.load(accessible.html);
    return {
      metaTags: this.seoAudit.analyzeMetaTags($, normalized),
      headings: this.seoAudit.analyzeHeadings($),
    };
  }

  @Get('seo-images-test')
  async seoImagesTest(@Query('url') url: string) {
    const normalized = this.checks.normalizeUrl(url);
    if (!normalized) throw new BadRequestException('Invalid URL');
    const accessible = await this.checks.checkAccessible(normalized);
    if (!accessible.html) return { error: 'Page not reachable' };
    const $ = cheerio.load(accessible.html);
    const base = this.seoAudit.analyzeImages($, normalized);
    const meta = await this.seoAudit.analyzeImageMetadata(base.images);
    return { findings: [...base.findings, ...meta.findings], imageCount: base.images.length };
  }

  @Get('seo-url-test')
  async seoUrlTest(@Query('url') url: string) {
    const normalized = this.checks.normalizeUrl(url);
    if (!normalized) throw new BadRequestException('Invalid URL');
    const accessible = await this.checks.checkAccessible(normalized);
    if (!accessible.html) return { error: 'Page not reachable' };
    const $ = cheerio.load(accessible.html);

    const urlFindings = this.seoAudit.analyzeUrl(normalized);
    const canonical = await this.seoAudit.analyzeCanonical($, normalized);
    const robotsMetaContent = $('meta[name="robots"]').attr('content') || null;
    const indexability = await this.seoAudit.analyzeIndexability({
      pageUrl: normalized,
      statusCode: accessible.statusCode,
      robotsMetaContent,
      xRobotsTagHeader: null,
      canonicalUrl: canonical.canonicalUrl,
      isSelfReferencing: canonical.isSelfReferencing,
    });

    return { url: urlFindings, canonical, indexability };
  }

  @Get('seo-audit-test')
  async seoAuditTest(@Query('url') url: string) {
    const normalized = this.checks.normalizeUrl(url);
    if (!normalized) throw new BadRequestException('Invalid URL');
    return this.seoAudit.runSeoAudit(normalized);
  }

  @Get('seo-crawl-test')
  async seoCrawlTest(@Query('url') url: string, @Query('max') max = '3') {
    const normalized = this.checks.normalizeUrl(url);
    if (!normalized) throw new BadRequestException('Invalid URL');
    const maxPages = Math.min(Number(max) || 3, 10);
    return this.seoAudit.runSeoAuditCrawl(normalized, maxPages);
  }
}