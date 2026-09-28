import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import robotsParser from 'robots-parser';
import * as tls from 'tls';
import {
  AccessibleResult,
  AiCrawlerAccessResult,
  AntiBotResult,
  BrokenLinksResult,
  CheckMap,
  Grade,
  ImagesAltResult,
  JsDependenceResult,
  LinkCheckResult,
  LlmsTxtResult,
  MetaDescriptionResult,
  RobotsResult,
  RunAllChecksResult,
  ScoreResult,
  SemanticHtmlResult,
  SitemapResult,
  SslResult,
  Status,
  StructuredDataResult,
  TitleResult,
  ViewportResult,
} from './checks.types';
import { errText, runWithConcurrencyLimit } from './checks.utils';
import { SsrfGuardService } from './ssrf-guard.service';

const MAX_LINKS_TO_CHECK = 40;
const CONCURRENCY = 5;

const AI_BOTS = [
  { name: 'GPTBot', company: 'OpenAI' },
  { name: 'OAI-SearchBot', company: 'OpenAI' },
  { name: 'ChatGPT-User', company: 'OpenAI' },
  { name: 'ClaudeBot', company: 'Anthropic' },
  { name: 'Claude-SearchBot', company: 'Anthropic' },
  { name: 'PerplexityBot', company: 'Perplexity' },
  { name: 'Google-Extended', company: 'Google' },
  { name: 'Googlebot', company: 'Google' },
  { name: 'Applebot-Extended', company: 'Apple' },
];

const CHECK_WEIGHTS: Record<string, number> = {
    accessible: 20,
    ssl: 20,
    viewport: 10,
    title: 10,
    metaDescription: 10,
    brokenLinks: 10,
    imagesAlt: 10,
    robotsTxt: 5,
    sitemap: 5,
    aiCrawlerAccess: 15,
    antiBotAccess: 15,
    structuredData: 10,
    jsDependence: 10,
    llmsTxt: 5,
    semanticHtml: 5,
  };
  
  const STATUS_VALUE: Record<Status, number> = {
    pass: 1,
    warning: 0.5,
    fail: 0,
  };

interface JsonLdItem {
    '@type'?: string | string[];
  }

  @Injectable()
  export class ChecksService {
    constructor(private readonly ssrfGuard: SsrfGuardService) {}
  
    normalizeUrl(rawUrl: unknown): string | null {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    let url = rawUrl.trim();
    if (!url) return null;
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.includes('.')) return null;
      return parsed.toString();
    } catch {
      return null;
    }
  }

  async checkAccessible(url: string): Promise<AccessibleResult> {
    const start = Date.now();
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: () => true,
      });
      const responseTimeMs = Date.now() - start;
      const statusCode = response.status;
      let status: Status = 'fail';
      if (statusCode >= 200 && statusCode < 300) {
        status = responseTimeMs > 3000 ? 'warning' : 'pass';
      }
      return { status, statusCode, responseTimeMs, html: response.data };
    } catch (err) {
      const responseTimeMs = Date.now() - start;
      return {
        status: 'fail',
        statusCode: null,
        responseTimeMs,
        error: errText(err),
        html: null,
      };
    }
  }
  checkTitle($: CheerioAPI): TitleResult {
    const title = $('title').first().text().trim();
    if (!title) return { status: 'fail', value: '', length: 0 };
    const length = title.length;
    const status: Status = length >= 50 && length <= 60 ? 'pass' : 'warning';
    return { status, value: title, length };
  }

  checkMetaDescription($: CheerioAPI): MetaDescriptionResult {
    const desc = $('meta[name="description"]').attr('content')?.trim() || '';
    if (!desc) return { status: 'fail', value: '', length: 0 };
    const length = desc.length;
    const status: Status = length >= 150 && length <= 160 ? 'pass' : 'warning';
    return { status, value: desc, length };
  }

  checkViewport($: CheerioAPI): ViewportResult {
    const viewport = $('meta[name="viewport"]').attr('content') || '';
    if (!viewport) return { status: 'fail' };
    const status: Status = viewport.includes('width=device-width')
      ? 'pass'
      : 'warning';
    return { status, value: viewport };
  }

  checkImagesAlt($: CheerioAPI): ImagesAltResult {
    const images = $('img');
    const total = images.length;
    let missingAlt = 0;
    const missingAltList: string[] = [];
    images.each((i, el) => {
      const alt = $(el).attr('alt');
      if (!alt || !alt.trim()) {
        missingAlt++;
        const src = $(el).attr('src') || $(el).attr('data-src') || '';
        let locator: string;
        if (src) {
          const parts = src.split('/').filter(Boolean);
          locator = parts[parts.length - 1] || src;
        } else {
          locator = `image ${i + 1}`;
        }
        missingAltList.push(locator);
      }
    });
    if (total === 0) {
      return { status: 'pass', total: 0, missingAlt: 0, missingAltList: [] };
    }
    const missingRatio = missingAlt / total;
    let status: Status = 'pass';
    if (missingRatio > 0.5) status = 'fail';
    else if (missingRatio > 0) status = 'warning';
    return { status, total, missingAlt, missingAltList };
  }
  async checkRobotsTxt(baseUrl: string): Promise<RobotsResult> {
    try {
      const robotsUrl = new URL('/robots.txt', baseUrl).toString();
      const response = await axios.get(robotsUrl, {
        timeout: 8000,
        validateStatus: () => true,
      });
      if (response.status === 404) {
        return { status: 'fail', reason: 'robots.txt not found' };
      }
      if (response.status !== 200) {
        return {
          status: 'warning',
          reason: `Unexpected status ${response.status}`,
        };
      }
      const content = (response.data || '').toString().trim();
      if (!content) {
        return { status: 'warning', reason: 'robots.txt is empty' };
      }
      const disallowsAll = /User-agent:\s*\*\s*\n\s*Disallow:\s*\/\s*$/im.test(
        content,
      );
      if (disallowsAll) {
        return {
          status: 'warning',
          reason: 'robots.txt disallows all crawling',
          content,
        };
      }
      return { status: 'pass', content };
    } catch (err) {
      return { status: 'fail', reason: errText(err) };
    }
  }

  async checkSitemap(
    baseUrl: string,
    robotsContent?: string,
  ): Promise<SitemapResult> {
    try {
      const sitemapUrl = new URL('/sitemap.xml', baseUrl).toString();
      const response = await axios.get(sitemapUrl, {
        timeout: 8000,
        validateStatus: () => true,
      });
      if (
        response.status === 200 &&
        (response.data || '').toString().includes('<')
      ) {
        return { status: 'pass', url: sitemapUrl };
      }
    } catch {
      // ignore and fall back to robots.txt
    }
    if (robotsContent) {
      const match = robotsContent.match(/^Sitemap:\s*(\S+)/im);
      if (match) {
        return { status: 'pass', url: match[1] };
      }
    }
    return {
      status: 'fail',
      reason: 'No sitemap found at /sitemap.xml or in robots.txt',
    };
  }

  checkSSL(hostname: string): Promise<SslResult> {
    return new Promise((resolve) => {
      const socket = tls.connect(
        { host: hostname, port: 443, servername: hostname, timeout: 8000 },
        () => {
          try {
            const cert = socket.getPeerCertificate();
            socket.end();

            if (!cert || !cert.valid_to) {
              return resolve({
                status: 'fail',
                reason: 'No certificate returned',
              });
            }

            const validTo = new Date(cert.valid_to);
            const daysRemaining = Math.floor(
              (validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
            );

            if (daysRemaining < 0) {
              return resolve({
                status: 'fail',
                reason: 'Certificate expired',
                validTo: cert.valid_to,
              });
            }
            if (!socket.authorized) {
              return resolve({
                status: 'fail',
                reason: String(
                  socket.authorizationError || 'Certificate not trusted',
                ),
              });
            }
            if (daysRemaining <= 30) {
              return resolve({
                status: 'warning',
                reason: `Certificate expires in ${daysRemaining} days`,
                validTo: cert.valid_to,
              });
            }

            return resolve({
              status: 'pass',
              issuer: cert.issuer?.O as string | undefined,
              validTo: cert.valid_to,
              daysRemaining,
            });
          } catch (err) {
            socket.end();
            resolve({ status: 'fail', reason: errText(err) });
          }
        },
      );

      socket.on('error', (err) =>
        resolve({ status: 'fail', reason: errText(err) }),
      );
      socket.on('timeout', () => {
        socket.destroy();
        resolve({ status: 'fail', reason: 'Connection timed out' });
      });
    });
  }
  extractLinks($: CheerioAPI, baseUrl: string): string[] {
    const hrefs = new Set<string>();
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      if (
        href.startsWith('#') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        href.startsWith('javascript:')
      ) {
        return;
      }
      try {
        const absolute = new URL(href, baseUrl).toString();
        hrefs.add(absolute);
      } catch {
        // ignore malformed hrefs
      }
    });
    return Array.from(hrefs).slice(0, MAX_LINKS_TO_CHECK);
  }

  async checkSingleLink(url: string): Promise<LinkCheckResult> {
    try {
      let response = await axios.head(url, {
        timeout: 8000,
        maxRedirects: 5,
        validateStatus: () => true,
      });

      if (response.status === 405 || response.status === 501) {
        response = await axios.get(url, {
          timeout: 8000,
          maxRedirects: 5,
          validateStatus: () => true,
        });
      }

      return { url, statusCode: response.status, ok: response.status < 400 };
    } catch (err) {
      return { url, statusCode: null, ok: false, error: errText(err) };
    }
  }

  async checkBrokenLinks(
    $: CheerioAPI,
    baseUrl: string,
  ): Promise<BrokenLinksResult> {
    const links = this.extractLinks($, baseUrl);
    if (links.length === 0) {
      return { status: 'pass', total: 0, broken: [] };
    }

    const results = await runWithConcurrencyLimit(links, CONCURRENCY, (link) =>
      this.checkSingleLink(link),
    );
    const broken = results.filter((r) => !r.ok);

    const brokenRatio = broken.length / results.length;
    let status: Status = 'pass';
    if (brokenRatio > 0.2) status = 'fail';
    else if (brokenRatio > 0) status = 'warning';

    return {
      status,
      total: results.length,
      broken: broken.map((b) => ({
        url: b.url,
        statusCode: b.statusCode,
        error: b.error,
      })),
    };
  }
  checkAiCrawlerAccess(
    baseUrl: string,
    robotsContent?: string,
  ): AiCrawlerAccessResult {
    if (!robotsContent) {
      return {
        status: 'pass',
        allowed: AI_BOTS.length,
        total: AI_BOTS.length,
        blocked: [],
      };
    }

    const robotsUrl = new URL('/robots.txt', baseUrl).toString();
    const robots = robotsParser(robotsUrl, robotsContent);

    const blocked = AI_BOTS.filter(
      (bot) => !robots.isAllowed(baseUrl, bot.name),
    ).map((bot) => bot.name);
    const allowed = AI_BOTS.length - blocked.length;

    let status: Status = 'pass';
    if (blocked.length > 0 && blocked.length < AI_BOTS.length) {
      status = 'warning';
    }
    if (blocked.length === AI_BOTS.length) status = 'fail';

    return { status, allowed, total: AI_BOTS.length, blocked };
  }

  checkStructuredData($: CheerioAPI): StructuredDataResult {
    const scripts = $('script[type="application/ld+json"]');
    const types: (string | string[])[] = [];

    scripts.each((i, el) => {
      try {
        const parsed: unknown = JSON.parse($(el).html() ?? '');
        const items = (Array.isArray(parsed) ? parsed : [parsed]) as JsonLdItem[];
        items.forEach((item) => {
          if (item && item['@type']) types.push(item['@type']);
        });
      } catch {
        // ignore invalid JSON-LD
      }
    });

    if (types.length === 0) {
      return { status: 'fail', found: 0, types: [] };
    }
    return { status: 'pass', found: types.length, types };
  }

  async checkLlmsTxt(baseUrl: string): Promise<LlmsTxtResult> {
    try {
      const llmsUrl = new URL('/llms.txt', baseUrl).toString();
      const response = await axios.get(llmsUrl, {
        timeout: 8000,
        validateStatus: () => true,
      });

      if (response.status !== 200) {
        return { status: 'fail', reason: 'llms.txt not found' };
      }
      const content = (response.data || '').toString().trim();
      if (!content) {
        return { status: 'warning', reason: 'llms.txt is empty' };
      }
      return { status: 'pass', url: llmsUrl };
    } catch (err) {
      return { status: 'fail', reason: errText(err) };
    }
  }

  checkSemanticHtml($: CheerioAPI): SemanticHtmlResult {
    const hasArticleOrSection = $('article, section').length > 0;
    const h1Count = $('h1').length;
    const hasHeadings = $('h2, h3, h4, h5, h6').length > 0;

    if (hasArticleOrSection && h1Count === 1) {
      return { status: 'pass', hasArticleOrSection, h1Count, hasHeadings };
    }
    if (h1Count === 0 || h1Count > 1 || !hasArticleOrSection) {
      return { status: 'warning', hasArticleOrSection, h1Count, hasHeadings };
    }
    return { status: 'fail', hasArticleOrSection, h1Count, hasHeadings };
  }

  checkJsDependence($: CheerioAPI): JsDependenceResult {
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const wordCount = bodyText ? bodyText.split(' ').length : 0;

    let status: Status = 'pass';
    if (wordCount < 50) status = 'fail';
    else if (wordCount < 250) status = 'warning';

    return { status, wordCount };
  }

  async checkAntiBotAccess(url: string): Promise<AntiBotResult> {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: { 'User-Agent': 'GPTBot/1.0' },
      });

      const statusCode = response.status;
      const rawTag = response.headers['x-robots-tag'];
      const xRobotsTag = rawTag ? String(rawTag) : null;
      const blockedByTag = !!xRobotsTag && /noindex|noai/i.test(xRobotsTag);

      if (statusCode === 200 && !blockedByTag) {
        return { status: 'pass', statusCode, xRobotsTag };
      }
      if (
        statusCode === 403 ||
        statusCode === 429 ||
        statusCode === 503 ||
        blockedByTag
      ) {
        return {
          status: 'fail',
          statusCode,
          xRobotsTag,
          reason: 'AI bot user-agent appears blocked',
        };
      }
      return { status: 'warning', statusCode, xRobotsTag };
    } catch (err) {
      return { status: 'fail', reason: errText(err) };
    }
  }
  computeScore(checks: CheckMap): ScoreResult {
    let earned = 0;
    let possible = 0;

    for (const [key, weight] of Object.entries(CHECK_WEIGHTS)) {
      const check = checks[key];
      if (!check) continue;
      possible += weight;
      earned += weight * (STATUS_VALUE[check.status] ?? 0);
    }

    const score = possible === 0 ? 0 : Math.round((earned / possible) * 100);

    let grade: Grade = 'F';
    if (score >= 90) grade = 'S';
    else if (score >= 80) grade = 'A';
    else if (score >= 70) grade = 'B';
    else if (score >= 60) grade = 'C';

    return { score, grade };
  }

  async runAllChecks(normalizedUrl: string): Promise<RunAllChecksResult> {
    await this.ssrfGuard.assertUrlIsSafe(normalizedUrl);
    
    const parsed = new URL(normalizedUrl);
    const accessible = await this.checkAccessible(normalizedUrl);

    const accessibleCheck = {
      status: accessible.status,
      statusCode: accessible.statusCode,
      responseTimeMs: accessible.responseTimeMs,
      ...(accessible.error ? { error: accessible.error } : {}),
    };
    const checks: CheckMap = { accessible: accessibleCheck };

    if (accessible.html) {
      const $ = cheerio.load(accessible.html);
      checks.title = this.checkTitle($);
      checks.metaDescription = this.checkMetaDescription($);
      checks.viewport = this.checkViewport($);
      checks.imagesAlt = this.checkImagesAlt($);
      checks.brokenLinks = await this.checkBrokenLinks($, normalizedUrl);
      checks.structuredData = this.checkStructuredData($);
      checks.semanticHtml = this.checkSemanticHtml($);
      checks.jsDependence = this.checkJsDependence($);
    }

    const robots = await this.checkRobotsTxt(normalizedUrl);
    const sitemap = await this.checkSitemap(normalizedUrl, robots.content);
    checks.robotsTxt = {
      status: robots.status,
      ...(robots.reason ? { reason: robots.reason } : {}),
    };
    checks.sitemap = {
      status: sitemap.status,
      ...(sitemap.url ? { url: sitemap.url } : {}),
      ...(sitemap.reason ? { reason: sitemap.reason } : {}),
    };

    checks.ssl = await this.checkSSL(parsed.hostname);

    checks.aiCrawlerAccess = this.checkAiCrawlerAccess(
      normalizedUrl,
      robots.content,
    );
    checks.antiBotAccess = await this.checkAntiBotAccess(normalizedUrl);
    checks.llmsTxt = await this.checkLlmsTxt(normalizedUrl);

    const { score, grade } = this.computeScore(checks);

    return {
      url: normalizedUrl,
      checkedAt: new Date().toISOString(),
      score,
      grade,
      checks,
    };
  }
}