import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ChecksService } from './checks.service';
import * as cheerio from 'cheerio';

@Controller('checks')
export class ChecksController {
  constructor(private readonly checks: ChecksService) {}

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
}