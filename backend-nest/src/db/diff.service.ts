import { Injectable } from '@nestjs/common';
import { CheckMap } from '../checks/checks.types';

const CHECK_LABELS: Record<string, string> = {
  accessible: 'Website Accessible',
  ssl: 'SSL Certificate',
  title: 'Page Title',
  metaDescription: 'Meta Description',
  sitemap: 'Sitemap Available',
  robotsTxt: 'Robots.txt Available',
  viewport: 'Mobile Viewport',
  imagesAlt: 'Images Missing Alt Text',
  brokenLinks: 'Broken Links',
  aiCrawlerAccess: 'AI Crawler Access',
  antiBotAccess: 'Anti-Bot / Header Check',
  structuredData: 'Structured Data (JSON-LD)',
  llmsTxt: 'llms.txt',
  semanticHtml: 'Semantic HTML',
  jsDependence: 'JS Dependence',
};

interface ReportForDiff {
  checks: CheckMap;
}

@Injectable()
export class DiffService {
  findNewlyFailedChecks(
    previousReport: ReportForDiff | null,
    newReport: ReportForDiff,
  ): string[] {
    if (!previousReport) return [];

    const newlyFailed: string[] = [];
    for (const [key, data] of Object.entries(newReport.checks)) {
      const newStatus = data.status;
      const oldStatus = previousReport.checks?.[key]?.status;

      if (newStatus === 'fail' && oldStatus !== 'fail') {
        newlyFailed.push(CHECK_LABELS[key] || key);
      }
    }
    return newlyFailed;
  }
}