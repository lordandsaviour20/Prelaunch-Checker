const puppeteer = require('puppeteer');
function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  const MODULE_LABELS = {
    metaTags: 'Meta Tags',
    headings: 'Heading Structure',
    images: 'Images',
    url: 'URL Structure',
    canonical: 'Canonical URL',
    indexability: 'Indexability',
  };

const MODULE_ORDER = ['metaTags', 'headings', 'images', 'url', 'canonical', 'indexability'];

const SEVERITY_LABEL = { passed: 'passed', warning: 'warning', critical: 'critical' };

function isAggregatedFinding(finding) {
  return Array.isArray(finding.issues);
}

function renderIssueList(issues) {
    if (!issues || issues.length === 0) return '';
    const items = issues
      .map((issue) => `<li><strong>${escapeHtml(issue.url)}</strong> — ${escapeHtml(issue.detail)}</li>`)
      .join('');
    return `<ul class="issue-list">${items}</ul>`;
  }
  
  function renderFindingRow(finding) {
    const severity = finding.severity || 'unknown';
    return `
      <tr>
        <td>${escapeHtml(finding.label)}</td>
        <td class="status-${severity}">${SEVERITY_LABEL[severity] || severity}</td>
        <td class="detail-cell">
          ${escapeHtml(finding.detail)}
          ${isAggregatedFinding(finding) ? renderIssueList(finding.issues) : ''}
          ${finding.recommendation ? `<div class="fix-note"><strong>Suggested fix:</strong> ${escapeHtml(finding.recommendation)}</div>` : ''}
        </td>
      </tr>`;
  }
  
  function renderHeadingTree(tree) {
    if (!tree || tree.length === 0) return '';
    const rows = tree
      .map((h) => `<div class="heading-tree-row" style="padding-left:${(h.level - 1) * 16}px">
        <span class="heading-tree-tag">H${h.level}</span> ${h.text ? escapeHtml(h.text) : '<em>(empty)</em>'}
      </div>`)
      .join('');
    return `<div class="heading-tree">${rows}</div>`;
  }

function renderModuleSection(key, mod, headingLevel) {
  if (!mod || !mod.findings || mod.findings.length === 0) return '';
  const rows = mod.findings.map(renderFindingRow).join('');
  return `
    <${headingLevel}>${mod.label || MODULE_LABELS[key] || key}</${headingLevel}>
    <table>
      <thead><tr><th>Check</th><th>Status</th><th>Details</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${renderHeadingTree(mod.tree)}`;
}

function renderGradingSystemSection(moduleScores) {
  const weightRows = (moduleScores || [])
    .map((m) => `<tr><td>${escapeHtml(m.label)}</td><td>${m.weight}</td><td>${m.score}/100</td></tr>`)
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

function renderPageBreakdownSection(pages) {
  if (!pages || pages.length === 0) return '';

  const pageBlocks = pages.map((page) => {
    const moduleSections = MODULE_ORDER
      .filter((key) => page.modules[key])
      .map((key) => renderModuleSection(key, page.modules[key], 'h4'))
      .join('');
    return `
      <div class="page-block">
        <h3 class="page-url">${page.url} <span class="page-score">(${page.score}/100)</span></h3>
        ${moduleSections}
      </div>`;
  }).join('');

  return `
    <div class="page-breakdown-section">
      <h2>Per-Page Breakdown (${pages.length} page${pages.length !== 1 ? 's' : ''} crawled)</h2>
      ${pageBlocks}
    </div>`;
}

function buildSeoAuditHtml(audit, scannedByEmail) {
    const { url, checkedAt, score, summary, modules, isCrawl, pagesCrawled, pages, overallCapped, moduleScores } = audit;
   
    const moduleSections = MODULE_ORDER
      .filter((key) => modules[key])
      .map((key) => renderModuleSection(key, modules[key], 'h2'))
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

    ${renderGradingSystemSection(moduleScores)}

    ${isCrawl ? renderPageBreakdownSection(pages) : ''}
  </body>
  </html>`;
}

async function generateSeoAuditPdf(audit, scannedByEmail) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setContent(buildSeoAuditHtml(audit, scannedByEmail), { waitUntil: 'load', timeout: 15000 });
  const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20px', bottom: '20px' } });
  await browser.close();
  return pdfBuffer;
}

module.exports = { generateSeoAuditPdf };