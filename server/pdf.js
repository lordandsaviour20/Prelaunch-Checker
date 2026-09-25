const puppeteer = require('puppeteer');

const CHECK_LABELS = {
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

const FIX_SUGGESTIONS = {

  aiCrawlerAccess: {
    warning: 'Some AI crawlers are blocked in robots.txt. Review which user-agents are disallowed and confirm that\'s intentional.',
    fail: 'All major AI crawlers are blocked in robots.txt. If you want AI search tools and assistants to discover this content, remove the blanket Disallow rules for these user-agents.',
  },
  antiBotAccess: {
    warning: 'The AI bot request returned an unexpected status. Investigate whether a firewall or bot-protection rule is partially blocking AI crawlers.',
    fail: 'Requests using an AI crawler user-agent are being blocked (by status code or an X-Robots-Tag: noindex/noai header). Review your WAF/Cloudflare rules and headers if you want this content visible to AI systems.',
  },
  structuredData: {
    fail: 'No structured data (JSON-LD) was found. Add Schema.org markup (e.g. Organization, Product, Article, or FAQPage) to help AI systems understand your content.',
  },
  llmsTxt: {
    warning: 'llms.txt exists but is empty. Populate it with a summary of your site structure for LLMs.',
    fail: 'No llms.txt file was found. Consider adding one at the site root — a markdown file summarizing your site for LLMs.',
  },
  semanticHtml: {
    warning: 'HTML structure could be improved for AI parsing — ensure exactly one <h1> per page and use <article>/<section> tags to mark up content areas.',
    fail: 'The page lacks semantic HTML structure. Use <article>, <section>, and a single <h1> to make content easier for AI systems to parse.',
  },
  jsDependence: {
    warning: 'The raw HTML has relatively little text — AI fetchers that don\'t execute JavaScript may struggle to read this page\'s content.',
    fail: 'The raw HTML has very little visible text, suggesting heavy client-side rendering. AI web-fetchers that only read raw HTML will likely see an empty or near-empty page. Consider server-side rendering or static generation for key content.',
  },
  accessible: {
    warning: 'The page responded, but slowly. Investigate server response time — consider caching, a CDN, or optimizing backend queries.',
    fail: 'The page did not respond successfully. Check that the server is running, the URL is correct, and there are no DNS or firewall issues blocking access.',
  },
  ssl: {
    warning: 'The SSL certificate is nearing expiration. Renew it soon to avoid the site showing as insecure.',
    fail: 'The SSL certificate is missing, expired, or untrusted. Install a valid certificate from a trusted certificate authority (e.g. via Let\'s Encrypt) and ensure HTTPS is properly configured.',
  },
  title: {
    warning: 'The page title is outside the ideal 50-60 character range. Adjust it to be descriptive but concise for better SEO and search-result display.',
    fail: 'No page title was found. Add a unique, descriptive <title> tag to every page.',
  },
  metaDescription: {
    warning: 'The meta description is outside the ideal 150-160 character range. Rewrite it to be a concise, compelling summary within that range.',
    fail: 'No meta description was found. Add a <meta name="description"> tag summarizing the page\'s content for search engines.',
  },
  viewport: {
    warning: 'A viewport tag is present but may not be configured correctly for responsive design. Ensure it includes width=device-width.',
    fail: 'No mobile viewport meta tag was found. Add <meta name="viewport" content="width=device-width, initial-scale=1"> to support mobile devices.',
  },
  imagesAlt: {
    warning: 'Some images are missing alt text. Add descriptive alt attributes to all meaningful images for accessibility and SEO.',
    fail: 'Most images are missing alt text. Add descriptive alt attributes to all meaningful images — this significantly impacts accessibility for screen-reader users.',
  },
  brokenLinks: {
    warning: 'Some broken links were found. Review and fix or remove them to avoid a poor user experience.',
    fail: 'A significant number of broken links were found. Audit all links on the site and fix or remove any that no longer resolve.',
  },
  robotsTxt: {
    warning: 'robots.txt exists but may have issues (e.g. it disallows all crawling, or is empty). Review its contents.',
    fail: 'No robots.txt file was found. Add one at the site root to guide search engine crawlers.',
  },
  sitemap: {
    fail: 'No sitemap was found at /sitemap.xml or referenced in robots.txt. Add an XML sitemap to help search engines index the site.',
  },
};

const GRADE_THRESHOLDS = [
  { grade: 'S', min: 90, color: '#820961' },
  { grade: 'A', min: 80, color: '#0B2BA3' },
  { grade: 'B', min: 70, color: '#149116' },
  { grade: 'C', min: 60, color: '#C4BE0A' },
  { grade: 'F', min: 0, color: '#DB0000' },
];

const CHECK_WEIGHTS = {
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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fixSuggestionFor(key, status) {
  if (status !== 'warning' && status !== 'fail') return null;
  return FIX_SUGGESTIONS[key]?.[status] || null;
}

function checkDetailText(key, data) {
  if (key === 'accessible') {
    let text = `Status code ${data.statusCode ?? 'N/A'}, responded in ${data.responseTimeMs}ms.`;
    if (data.error) text += ` Error: ${data.error}`;
    return text;
  }
  if (key === 'ssl') {
    let text = '';
    if (data.issuer) text += `Issued by ${data.issuer}. `;
    if (data.validTo) text += `Valid until ${data.validTo}. `;
    if (data.reason) text += data.reason;
    return text || 'No further details.';
  }
  if (key === 'title' || key === 'metaDescription') {
    return data.value ? `"${data.value}" (${data.length} characters)` : 'Not found on the page.';
  }
  if (key === 'viewport') {
    return data.value ? `Found: ${data.value}` : 'No viewport meta tag found.';
  }
  if (key === 'imagesAlt') {
    return `${data.missingAlt} of ${data.total} images are missing alt text.`;
  }
  if (key === 'sitemap' || key === 'robotsTxt') {
    return data.url || data.reason || 'No further details.';
  }
  if (key === 'brokenLinks') {
    let text = `Checked ${data.total} link${data.total !== 1 ? 's' : ''}, ${data.broken.length} broken.`;
    if (data.broken.length > 0) {
      const list = data.broken.map((link) => `${link.url} (${link.statusCode ?? link.error})`).join('; ');
      text += ` — ${list}`;
    }
    return text;
  }
  if (key === 'aiCrawlerAccess') {
    let text = `${data.allowed} of ${data.total} AI crawlers allowed.`;
    if (data.blocked && data.blocked.length > 0) text += ` Blocked: ${data.blocked.join(', ')}.`;
    return text;
  }
  if (key === 'antiBotAccess') {
    let text = `Status code ${data.statusCode ?? 'N/A'} when requested as an AI bot.`;
    if (data.xRobotsTag) text += ` X-Robots-Tag: ${data.xRobotsTag}.`;
    if (data.reason) text += ` ${data.reason}`;
    return text;
  }
  if (key === 'structuredData') {
    return data.found > 0
      ? `${data.found} structured data block${data.found !== 1 ? 's' : ''} found (${data.types.join(', ')}).`
      : 'No JSON-LD structured data found.';
  }
  if (key === 'llmsTxt') {
    return data.url || data.reason || 'No further details.';
  }
  if (key === 'semanticHtml') {
    return `${data.hasArticleOrSection ? 'Semantic <article>/<section> tags found.' : 'No <article>/<section> tags found.'} ${data.h1Count} H1 tag${data.h1Count !== 1 ? 's' : ''} found.`;
  }
  if (key === 'jsDependence') {
    return `${data.wordCount} words detected in raw HTML.`;
  }
  return data.reason || data.error || 'No further details.';
}

function aggregatedDetailText(data) {
  let text = `${data.passing} of ${data.total} page${data.total !== 1 ? 's' : ''} passing`;
  if (data.failing > 0) text += `, ${data.failing} failing`;
  if (data.warning > 0) text += `, ${data.warning} with warnings`;
  return text + '.';
}

function renderIssueList(issues) {
  if (!issues || issues.length === 0) return '';
  const items = issues
    .map((issue) => `<li><strong>${escapeHtml(issue.url)}</strong> — ${escapeHtml(issue.detail)}</li>`)
    .join('');
  return `<ul class="issue-list">${items}</ul>`;
}

function renderCheckRow(key, val, isCrawl) {
  const status = val.status || 'unknown';
  const label = CHECK_LABELS[key] || key;
  const isAggregated = isCrawl && val.total !== undefined && val.failing !== undefined;
  const detail = isAggregated ? aggregatedDetailText(val) : checkDetailText(key, val);
  const fix = fixSuggestionFor(key, status);

  return `
    <tr>
      <td>${label}</td>
      <td class="status-${status}">${status}</td>
      <td class="detail-cell">
        ${escapeHtml(detail)}
        ${isAggregated ? renderIssueList(val.issues) : ''}
        ${fix ? `<div class="fix-note"><strong>Suggested fix:</strong> ${escapeHtml(fix)}</div>` : ''}
      </td>
    </tr>`;
}

function renderGradingSystemSection() {
  const weightRows = Object.entries(CHECK_WEIGHTS)
    .map(([key, weight]) => `<tr><td>${CHECK_LABELS[key] || key}</td><td>${weight} points</td></tr>`)
    .join('');

  const gradeRows = GRADE_THRESHOLDS
    .map((g, i) => {
      const upper = i === 0 ? 100 : GRADE_THRESHOLDS[i - 1].min - 1;
      const range = g.min === upper ? `${g.min}` : `${g.min}–${upper}`;
      return `<tr><td><span class="grade-pill" style="background:${g.color}">${g.grade}</span></td><td>${range}</td></tr>`;
    })
    .join('');

  return `
    <div class="grading-section">
      <h2>How This Score Was Calculated</h2>
      <p>
        Each check contributes a weighted number of points toward a 100-point total score.
        A check that fully passes earns its full weight; a warning earns half; a failure earns none.
        The final score is the sum of earned points divided by the total possible points, as a percentage.
      </p>
      <div class="grading-tables">
        <table class="weights-table">
          <thead><tr><th>Check</th><th>Weight</th></tr></thead>
          <tbody>${weightRows}</tbody>
        </table>
        <table class="grades-table">
          <thead><tr><th>Grade</th><th>Score Range</th></tr></thead>
          <tbody>${gradeRows}</tbody>
        </table>
      </div>
    </div>`;
}

function renderPageBreakdownSection(pages) {
  if (!pages || pages.length === 0) return '';

  const pageBlocks = pages.map((page) => {
    const rows = Object.entries(page.checks)
      .map(([key, val]) => renderCheckRow(key, val, false))
      .join('');
    return `
      <div class="page-block">
        <h3 class="page-url">${page.url}</h3>
        <table>
          <thead><tr><th>Check</th><th>Status</th><th>Details</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join('');

  return `
    <div class="page-breakdown-section">
      <h2>Per-Page Breakdown (${pages.length} page${pages.length !== 1 ? 's' : ''} crawled)</h2>
      ${pageBlocks}
    </div>`;
}

function buildReportHtml(report, scannedByEmail) {
  const { url, checkedAt, score, grade, checks, isCrawl, pagesCrawled, pages } = report;

  const summaryRows = Object.entries(checks)
    .map(([key, val]) => renderCheckRow(key, val, isCrawl))
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
      .meta { color: #666; font-size: 13px; margin-bottom: 4px; }
      .grade { font-size: 48px; font-weight: bold; margin-top: 16px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; table-layout: fixed; }
      th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 12px; vertical-align: top; word-wrap: break-word; }
      th { color: #666; font-weight: 600; }
      th:nth-child(1), td:nth-child(1) { width: 20%; }
      th:nth-child(2), td:nth-child(2) { width: 12%; }
      .detail-cell { width: 68%; }
      .status-fail { color: #c0392b; font-weight: 600; }
      .status-warning { color: #b8860b; font-weight: 600; }
      .status-ok, .status-pass { color: #2e7d32; font-weight: 600; }
      .fix-note { margin-top: 6px; font-size: 11px; color: #555; font-weight: normal; background: #fafafa; border-left: 2px solid #ddd; padding: 4px 8px; }
      .issue-list { margin: 6px 0 0; padding-left: 16px; font-size: 11px; color: #444; }
      .issue-list li { margin-bottom: 3px; }
      .grading-section p { font-size: 12px; color: #444; line-height: 1.5; }
      .grading-tables { display: flex; gap: 24px; margin-top: 12px; }
      .weights-table, .grades-table { width: auto; flex: 1; }
      .grade-pill { display: inline-block; min-width: 20px; text-align: center; padding: 2px 8px; border-radius: 4px; color: #fff; font-weight: 600; font-size: 11px; }
      .page-breakdown-section { page-break-before: always; }
      .page-block { page-break-inside: avoid; margin-bottom: 16px; }
    </style>
  </head>
  <body>
    <h1>Prelaunch Report: ${url}</h1>
    <div class="meta">Checked at ${new Date(checkedAt).toLocaleString()}</div>
    ${scannedByEmail ? `<div class="meta">Scanned by ${scannedByEmail}</div>` : ''}
    ${isCrawl ? `<div class="meta">Multi-page crawl — ${pagesCrawled} page${pagesCrawled !== 1 ? 's' : ''} checked</div>` : ''}
    <div class="grade">${grade} <span style="font-size:16px;color:#666">(${score}/100)</span></div>

    <h2>Summary${isCrawl ? ' (Aggregated Across All Pages)' : ''}</h2>
    <table>
      <thead><tr><th>Check</th><th>Status</th><th>Details</th></tr></thead>
      <tbody>${summaryRows}</tbody>
    </table>

    ${renderGradingSystemSection()}

    ${isCrawl ? renderPageBreakdownSection(pages) : ''}
  </body>
  </html>`;
}

async function generatePdf(report, scannedByEmail) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setContent(buildReportHtml(report, scannedByEmail), { waitUntil: 'load', timeout: 15000 });
  const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20px', bottom: '20px' } });
  await browser.close();
  return pdfBuffer;
}

module.exports = { generatePdf };