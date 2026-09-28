import { Injectable } from '@nestjs/common';
import { ChecksService } from './checks.service';
import {
  AggregatedCheck,
  CheckDetail,
  CheckMap,
  PageResult,
  RunCrawlChecksResult,
  Status,
} from './checks.types';
import { CrawlerService } from './crawler.service';
import { SsrfGuardService } from './ssrf-guard.service';

const CRAWL_CHECK_KEYS = [
  'title',
  'metaDescription',
  'viewport',
  'imagesAlt',
  'brokenLinks',
  'accessible',
  'structuredData',
  'semanticHtml',
  'jsDependence',
];
const FAIL_THRESHOLD = 0.2;

@Injectable()
export class CrawlChecksService {
  constructor(
    private readonly checks: ChecksService,
    private readonly crawler: CrawlerService,
    private readonly ssrfGuard: SsrfGuardService,
  ) {}

  buildPageIssueDetail(key: string, data: CheckDetail): string {
    if (key === 'imagesAlt') {
      if (data.missingAltList && data.missingAltList.length > 0) {
        return data.missingAltList.join(', ');
      }
      return `${data.missingAlt} of ${data.total} images missing alt text`;
    }
    if (key === 'brokenLinks') {
      if (data.broken && data.broken.length > 0) {
        return data.broken
          .map((b) => `${b.url} (${b.statusCode ?? b.error})`)
          .join('; ');
      }
      return 'Broken links detected';
    }
    if (key === 'title') {
      return data.value
        ? `"${data.value}" (${data.length} characters)`
        : 'No title found';
    }
    if (key === 'metaDescription') {
      return data.value
        ? `"${data.value}" (${data.length} characters)`
        : 'No meta description found';
    }
    if (key === 'viewport') {
      return data.value ? `Found: ${data.value}` : 'No viewport meta tag found';
    }
    if (key === 'accessible') {
      if (data.error) return `Error: ${data.error}`;
      return `Status code ${data.statusCode ?? 'N/A'}, responded in ${data.responseTimeMs}ms`;
    }
    if (key === 'structuredData') {
      return data.found && data.found > 0
        ? `${data.found} structured data block(s) found (${(data.types ?? []).join(', ')})`
        : 'No JSON-LD structured data found';
    }
    if (key === 'semanticHtml') {
      return `${data.hasArticleOrSection ? 'Has' : 'Missing'} article/section tags, ${data.h1Count} H1 tag(s)`;
    }
    if (key === 'jsDependence') {
      return `${data.wordCount} words detected in raw HTML`;
    }
    return data.reason || data.error || 'Issue detected';
  }

  aggregateCrawlChecks(pages: PageResult[]): Record<string, AggregatedCheck> {
    const aggregated: Record<string, AggregatedCheck> = {};

    for (const key of CRAWL_CHECK_KEYS) {
      const relevant = pages.filter((p) => p.checks[key]);
      const total = relevant.length;
      if (total === 0) continue;

      const detailOf = (p: PageResult) => p.checks[key] as CheckDetail;

      const failing = relevant.filter(
        (p) => detailOf(p).status === 'fail',
      ).length;
      const warning = relevant.filter(
        (p) => detailOf(p).status === 'warning',
      ).length;
      const failRatio = failing / total;

      let status: Status = 'pass';
      if (failRatio > FAIL_THRESHOLD) status = 'fail';
      else if (failing > 0 || warning > 0) status = 'warning';

      const issues = relevant
        .filter((p) => detailOf(p).status !== 'pass')
        .map((p) => ({
          url: p.url,
          status: detailOf(p).status,
          detail: this.buildPageIssueDetail(key, detailOf(p)),
        }));

      aggregated[key] = {
        status,
        total,
        failing,
        warning,
        passing: total - failing - warning,
        issues,
      };
    }

    return aggregated;
  }

  async runCrawlChecks(
    normalizedUrl: string,
    maxPages: number,
  ): Promise<RunCrawlChecksResult> {
    await this.ssrfGuard.assertUrlIsSafe(normalizedUrl);

    const pages = await this.crawler.crawlSite(normalizedUrl, maxPages);

    const parsed = new URL(normalizedUrl);
    const robots = await this.checks.checkRobotsTxt(normalizedUrl);
    const sitemap = await this.checks.checkSitemap(
      normalizedUrl,
      robots.content,
    );
    const ssl = await this.checks.checkSSL(parsed.hostname);

    const checks: CheckMap = {
      ...this.aggregateCrawlChecks(pages),
      robotsTxt: {
        status: robots.status,
        ...(robots.reason ? { reason: robots.reason } : {}),
      },
      sitemap: {
        status: sitemap.status,
        ...(sitemap.url ? { url: sitemap.url } : {}),
        ...(sitemap.reason ? { reason: sitemap.reason } : {}),
      },
      ssl,
      // Site-level AI Visibility checks: run once on the homepage, not per page
      aiCrawlerAccess: this.checks.checkAiCrawlerAccess(
        normalizedUrl,
        robots.content,
      ),
      antiBotAccess: await this.checks.checkAntiBotAccess(normalizedUrl),
      llmsTxt: await this.checks.checkLlmsTxt(normalizedUrl),
    };

    const { score, grade } = this.checks.computeScore(checks);

    return {
      url: normalizedUrl,
      checkedAt: new Date().toISOString(),
      score,
      grade,
      checks,
      isCrawl: true,
      pagesCrawled: pages.length,
      pages: pages.map((p) => ({ url: p.url, checks: p.checks })),
    };
  }
}