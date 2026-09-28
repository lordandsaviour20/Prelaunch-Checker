import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { chromium } from 'playwright';
import type { Browser } from 'playwright';
import { ChecksService } from './checks.service';
import { JsDependenceResult, PageResult, Status } from './checks.types';
import { errText } from './checks.utils';

const CRAWL_CONCURRENCY = 2;

interface RenderedPage {
  status: Status;
  statusCode: number | null;
  responseTimeMs: number;
  html: string | null;
  error?: string;
}

@Injectable()
export class CrawlerService {
  constructor(private readonly checks: ChecksService) {}

  isInternalLink(linkUrl: string, rootHostname: string): boolean {
    try {
      const parsed = new URL(linkUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return false;
      }
      return (
        parsed.hostname === rootHostname ||
        parsed.hostname.endsWith('.' + rootHostname)
      );
    } catch {
      return false;
    }
  }

  extractInternalLinks(
    $: CheerioAPI,
    baseUrl: string,
    rootHostname: string,
  ): string[] {
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
        const clean = absolute.split('#')[0];
        if (this.isInternalLink(clean, rootHostname)) {
          hrefs.add(clean);
        }
      } catch {
        // ignore malformed hrefs
      }
    });
    return Array.from(hrefs);
  }

  private async fetchRenderedPage(
    browser: Browser,
    pageUrl: string,
  ): Promise<RenderedPage> {
    const context = await browser.newContext();
    const page = await context.newPage();
    const start = Date.now();
    try {
      const response = await page.goto(pageUrl, {
        waitUntil: 'networkidle',
        timeout: 15000,
      });
      const responseTimeMs = Date.now() - start;
      const statusCode = response ? response.status() : null;
      const html = await page.content();

      let status: Status = 'fail';
      if (statusCode !== null && statusCode >= 200 && statusCode < 300) {
        status = responseTimeMs > 3000 ? 'warning' : 'pass';
      }
      return { status, statusCode, responseTimeMs, html };
    } catch (err) {
      return {
        status: 'fail',
        statusCode: null,
        responseTimeMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
        html: null,
      };
    } finally {
      await context.close();
    }
  }

  private async checkJsDependenceForPage(
    pageUrl: string,
  ): Promise<JsDependenceResult & { error?: string }> {
    try {
      const response = await axios.get(pageUrl, {
        timeout: 10000,
        validateStatus: () => true,
      });
      if (typeof response.data !== 'string') {
        return { status: 'fail', wordCount: 0 };
      }
      const $raw = cheerio.load(response.data);
      return this.checks.checkJsDependence($raw);
    } catch (err) {
      return { status: 'fail', wordCount: 0, error: errText(err) };
    }
  }

  private async checkOnePage(
    browser: Browser,
    pageUrl: string,
  ): Promise<{ page: PageResult; $?: CheerioAPI }> {
    const accessible = await this.fetchRenderedPage(browser, pageUrl);

    const accessibleCheck = {
      status: accessible.status,
      statusCode: accessible.statusCode,
      responseTimeMs: accessible.responseTimeMs,
      ...(accessible.error ? { error: accessible.error } : {}),
    };
    const page: PageResult = {
      url: pageUrl,
      checks: { accessible: accessibleCheck },
    };

    let $: CheerioAPI | undefined;
    if (accessible.html) {
      $ = cheerio.load(accessible.html);
      page.checks.title = this.checks.checkTitle($);
      page.checks.metaDescription = this.checks.checkMetaDescription($);
      page.checks.viewport = this.checks.checkViewport($);
      page.checks.imagesAlt = this.checks.checkImagesAlt($);
      page.checks.brokenLinks = await this.checks.checkBrokenLinks($, pageUrl);
      page.checks.structuredData = this.checks.checkStructuredData($);
      page.checks.semanticHtml = this.checks.checkSemanticHtml($);
    }

    page.checks.jsDependence = await this.checkJsDependenceForPage(pageUrl);

    return { page, $ };
  }

  async crawlSite(rootUrl: string, maxPages: number): Promise<PageResult[]> {
    const rootHostname = new URL(rootUrl).hostname;
    const visited = new Set<string>();
    const queue: string[] = [rootUrl];
    const pages: PageResult[] = [];

    const browser = await chromium.launch();

    try {
      while (queue.length > 0 && pages.length < maxPages) {
        const remaining = maxPages - pages.length;
        const batch: string[] = [];
        while (
          batch.length < CRAWL_CONCURRENCY &&
          batch.length < remaining &&
          queue.length > 0
        ) {
          const next = queue.shift() as string;
          if (visited.has(next)) continue;
          visited.add(next);
          batch.push(next);
        }
        if (batch.length === 0) break;

        const results = await Promise.all(
          batch.map((pageUrl) => this.checkOnePage(browser, pageUrl)),
        );

        for (const { page, $ } of results) {
          if ($) {
            const links = this.extractInternalLinks($, page.url, rootHostname);
            for (const link of links) {
              if (!visited.has(link) && !queue.includes(link)) {
                queue.push(link);
              }
            }
          }
          pages.push(page);
        }
      }
    } finally {
      await browser.close();
    }

    return pages;
  }
}