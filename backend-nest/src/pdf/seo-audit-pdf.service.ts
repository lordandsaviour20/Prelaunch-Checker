import { Injectable } from '@nestjs/common';
import { chromium } from 'playwright';

const MODULE_LABELS: Record<string, string> = {
  metaTags: 'Meta Tags',
  headings: 'Heading Structure',
  images: 'Images',
  url: 'URL Structure',
  canonical: 'Canonical URL',
  indexability: 'Indexability',
};

const MODULE_ORDER = ['metaTags', 'headings', 'images', 'url', 'canonical', 'indexability'];

const SEVERITY_LABEL: Record<string, string> = { passed: 'passed', warning: 'warning', critical: 'critical' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FindingData = any;

interface SeoAuditForPdf {
  url: string;
  checkedAt: string;
  score: number;
  summary: { passed: number; warning: number; critical: number };
  modules: Record<string, { label?: string; findings: FindingData[]; tree?: FindingData[] }>;
  isCrawl?: boolean;
  pagesCrawled?: number;
  pages?: {
    url: string;
    score: number;
    modules: Record<string, { label?: string; findings: FindingData[]; tree?: FindingData[] }>;
  }[];
  overallCapped?: boolean;
  moduleScores?: { label: string; weight: number; score: number }[];
}

@Injectable()
export class SeoAuditPdfService {
  private escapeHtml(str: unknown): string {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private isAggregatedFinding(finding: FindingData): boolean {
    return Array.isArray(finding.issues);
  }

  private renderIssueList(issues: FindingData[]): string {
    if (!issues || issues.length === 0) return '';
    const items = issues
      .map(
        (issue) =>
          `<li><strong>${this.escapeHtml(issue.url)}</strong> — ${this.escapeHtml(issue.detail)}</li>`,
      )
      .join('');
    return `<ul class="issue-list">${items}</ul>`;
  }

  private renderFindingRow(finding: FindingData): string {
    const severity = finding.severity || 'unknown';
    return `
      <tr>
        <td>${this.escapeHtml(finding.label)}</td>
        <td class="status-${severity}">${SEVERITY_LABEL[severity] || severity}</td>
        <td class="detail-cell">
          ${this.escapeHtml(finding.detail)}
          ${this.isAggregatedFinding(finding) ? this.renderIssueList(finding.issues) : ''}
          ${finding.recommendation ? `<div class="fix-note"><strong>Suggested fix:</strong> ${this.escapeHtml(finding.recommendation)}</div>` : ''}
        </td>
      </tr>`;
  }

  private renderHeadingTree(tree?: FindingData[]): string {
    if (!tree || tree.length === 0) return '';
    const rows = tree
      .map(
        (h) => `<div class="heading-tree-row" style="padding-left:${(h.level - 1) * 16}px">
        <span class="heading-tree-tag">H${h.level}</span> ${h.text ? this.escapeHtml(h.text) : '<em>(empty)</em>'}
      </div>`,
      )
      .join('');
    return `<div class="heading-tree">${rows}</div>`;
  }

  private renderModuleSection(
    key: string,
    mod: { label?: string; findings: FindingData[]; tree?: FindingData[] } | undefined,
    headingLevel: string,
  ): string {
    if (!mod || !mod.findings || mod.findings.length === 0) return '';
    const rows = mod.findings.map((f) => this.renderFindingRow(f)).join('');
    return `
    <${headingLevel}>${mod.label || MODULE_LABELS[key] || key}</${headingLevel}>
    <table>
      <thead><tr><th>Check</th><th>Status</th><th>Details</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${this.renderHeadingTree(mod.tree)}`;
  }

  private renderGradingSystemSection(moduleScores?: { label: string; weight: number; score: number }[]): string {
    const weightRows = (moduleScores || [])
      .map((m) => `<tr><td>${this.escapeHtml(m.label)}</td><td>${m.weight}</td><td>${m.score}/100</td></tr>`)
      .join('');

    return `
    <div class="grading-section">
      <h2>How This Score Was Calculated</h2>
      <p>
        Each module's findings first collapse into a 0-100 sub-score (a passed finding earns
        full credit, a warning earns half credit, a critical finding earns no credit). Each
        module is then weighted by its relative SEO impact, and the overall score is the
        weighted average across all modules. If Indexability has any critical finding, the
        overall score is capped at 40 regardless of the other modules, since a page that
        cannot be indexed makes everything else moot.
      </p>
      <table class="weights-table">
        <thead><tr><th>Module</th><th>Weight</th><th>Score</th></tr></thead>
        <tbody>${weightRows}</tbody>
      </table>
    </div>`;
  }

  private renderPageBreakdownSection(pages?: SeoAuditForPdf['pages']): string {
    if (!pages || pages.length === 0) return '';

    const pageBlocks = pages
      .map((page) => {
        const moduleSections = MODULE_ORDER.filter((key) => page.modules[key])
          .map((key) => this.renderModuleSection(key, page.modules[key], 'h4'))
          .join('');
        return `
      <div class="page-block">
        <h3 class="page-url">${page.url} <span class="page-score">(${page.score}/100)</span></h3>
        ${moduleSections}
      </div>`;
      })
      .join('');

    return `
    <div class="page-breakdown-section">
      <h2>Per-Page Breakdown (${pages.length} page${pages.length !== 1 ? 's' : ''} crawled)</h2>
      ${pageBlocks}
    </div>`;
  }

  private buildSeoAuditHtml(audit: SeoAuditForPdf, scannedByEmail?: string | null): string {
    const { url, checkedAt, score, summary, modules, isCrawl, pagesCrawled, pages, moduleScores } = audit;

    const moduleSections = MODULE_ORDER.filter((key) => modules[key])
      .map((key) => this.renderModuleSection(key, modules[key], 'h2'))
      .join('');

    return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: -apple-system, Arial, sans-serif; margin: 40px; color: #111; }
      h1 { font-size: 20px; margin-bottom: 4px; }
      h2 { font-size: 16px; margin-top: 32px; margin-bottom: 8px; border-top: 1px solid #eee; padding-top: 20px; }
      h3.page-url { font-size: 13px; margin: 20px 0 6px; color: #333; word-break: break-all; }
      h4 { font-size: 13px; margin-top: 16px; margin-bottom: 4px; color: #444; }
      .page-score { font-weight: normal; color: #888; }
      .meta { color: #666; font-size: 13px; margin-bottom: 4px; }
      .grade { font-size: 48px; font-weight: bold; margin-top: 16px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; table-layout: fixed; }
      th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 12px; vertical-align: top; word-wrap: break-word; }
      th { color: #666; font-weight: 600; }
      th:nth-child(1), td:nth-child(1) { width: 20%; }
      th:nth-child(2), td:nth-child(2) { width: 12%; }
      .detail-cell { width: 68%; }
      .status-critical { color: #c0392b; font-weight: 600; }
      .status-warning { color: #b8860b; font-weight: 600; }
      .status-passed { color: #2e7d32; font-weight: 600; }
      .fix-note { margin-top: 6px; font-size: 11px; color: #555; font-weight: normal; background: #fafafa; border-left: 2px solid #ddd; padding: 4px 8px; }
      .issue-list { margin: 6px 0 0; padding-left: 16px; font-size: 11px; color: #444; }
      .issue-list li { margin-bottom: 3px; }
      .heading-tree { margin: 8px 0 4px; font-size: 11px; color: #444; }
      .heading-tree-row { padding: 2px 0; }
      .heading-tree-tag { display: inline-block; width: 26px; font-weight: 600; color: #888; }
      .grading-section p { font-size: 12px; color: #444; line-height: 1.5; }
      .severity-table { max-width: 300px; }
      .page-breakdown-section { page-break-before: always; }
      .page-block { page-break-inside: avoid; margin-bottom: 16px; }
    </style>
  </head>
  <body>
    <h1>SEO Audit Report: ${url}</h1>
    <div class="meta">Checked at ${new Date(checkedAt).toLocaleString()}</div>
    ${scannedByEmail ? `<div class="meta">Scanned by ${scannedByEmail}</div>` : ''}
    ${isCrawl ? `<div class="meta">Multi-page crawl — ${pagesCrawled} page${pagesCrawled !== 1 ? 's' : ''} checked</div>` : ''}
    <div class="grade">${score}<span style="font-size:16px;color:#666"> / 100</span></div>
    <div class="meta">${summary.passed} passed, ${summary.warning} warnings, ${summary.critical} critical</div>

    <h2>Summary${isCrawl ? ' (Aggregated Across All Pages)' : ''}</h2>
    ${moduleSections}

    ${this.renderGradingSystemSection(moduleScores)}

    ${isCrawl ? this.renderPageBreakdownSection(pages) : ''}
  </body>
  </html>`;
  }

  async generateSeoAuditPdf(audit: SeoAuditForPdf, scannedByEmail?: string | null): Promise<Buffer> {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent(this.buildSeoAuditHtml(audit, scannedByEmail), {
        waitUntil: 'load',
        timeout: 15000,
      });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20px', bottom: '20px' },
      });
      return pdfBuffer;
    } finally {
      await browser.close();
    }
  }
}