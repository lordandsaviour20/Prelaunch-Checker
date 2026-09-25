const axios = require('axios');
const cheerio = require('cheerio');
const tls = require('tls');
const robotsParser = require('robots-parser');
const { assertUrlIsSafe } = require('./ssrf-guard');

function normalizeUrl(rawUrl) {
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
  } catch (err) {
    return null;
  }
}

async function checkAccessible(url) {
  const start = Date.now();
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      maxRedirects: 5,
      validateStatus: () => true,
    });
    const responseTimeMs = Date.now() - start;
    const statusCode = response.status;
    let status = 'fail';
    if (statusCode >= 200 && statusCode < 300) {
      status = responseTimeMs > 3000 ? 'warning' : 'pass';
    }
    return { status, statusCode, responseTimeMs, html: response.data };
  } catch (err) {
    const responseTimeMs = Date.now() - start;
    return { status: 'fail', statusCode: null, responseTimeMs, error: err.code || err.message, html: null };
  }
}

function checkTitle($) {
  const title = $('title').first().text().trim();
  if (!title) return { status: 'fail', value: '', length: 0 };
  const length = title.length;
  const status = length >= 50 && length <= 60 ? 'pass' : 'warning';
  return { status, value: title, length };
}

function checkMetaDescription($) {
  const desc = $('meta[name="description"]').attr('content')?.trim() || '';
  if (!desc) return { status: 'fail', value: '', length: 0 };
  const length = desc.length;
  const status = length >= 150 && length <= 160 ? 'pass' : 'warning';
  return { status, value: desc, length };
}

function checkViewport($) {
  const viewport = $('meta[name="viewport"]').attr('content') || '';
  if (!viewport) return { status: 'fail' };
  const status = viewport.includes('width=device-width') ? 'pass' : 'warning';
  return { status, value: viewport };
}

function checkImagesAlt($) {
  const images = $('img');
  const total = images.length;
  let missingAlt = 0;
  const missingAltList = [];
  images.each((i, el) => {
    const alt = $(el).attr('alt');
    if (!alt || !alt.trim()) {
      missingAlt++;
      const src = $(el).attr('src') || $(el).attr('data-src') || '';
      let locator;
      if (src) {
        const parts = src.split('/').filter(Boolean);
        locator = parts[parts.length - 1] || src;
      } else {
        locator = `image ${i + 1}`;
      }
      missingAltList.push(locator);
    }
  });
  if (total === 0) return { status: 'pass', total: 0, missingAlt: 0, missingAltList: [] };
  const missingRatio = missingAlt / total;
  let status = 'pass';
  if (missingRatio > 0.5) status = 'fail';
  else if (missingRatio > 0) status = 'warning';
  return { status, total, missingAlt, missingAltList };
}

async function checkRobotsTxt(baseUrl) {
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
      return { status: 'warning', reason: `Unexpected status ${response.status}` };
    }
    const content = (response.data || '').toString().trim();
    if (!content) {
      return { status: 'warning', reason: 'robots.txt is empty' };
    }
    const disallowsAll = /User-agent:\s*\*\s*\n\s*Disallow:\s*\/\s*$/im.test(content);
    if (disallowsAll) {
      return { status: 'warning', reason: 'robots.txt disallows all crawling', content };
    }
    return { status: 'pass', content };
  } catch (err) {
    return { status: 'fail', reason: err.code || err.message };
  }
}

async function checkSitemap(baseUrl, robotsContent) {
  try {
    const sitemapUrl = new URL('/sitemap.xml', baseUrl).toString();
    const response = await axios.get(sitemapUrl, {
      timeout: 8000,
      validateStatus: () => true,
    });
    if (response.status === 200 && (response.data || '').toString().includes('<')) {
      return { status: 'pass', url: sitemapUrl };
    }
  } catch (err) {
  }
  if (robotsContent) {
    const match = robotsContent.match(/^Sitemap:\s*(\S+)/im);
    if (match) {
      return { status: 'pass', url: match[1] };
    }
  }
  return { status: 'fail', reason: 'No sitemap found at /sitemap.xml or in robots.txt' };
}

function checkSSL(hostname) {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: hostname, port: 443, servername: hostname, timeout: 8000 },
      () => {
        try {
          const cert = socket.getPeerCertificate();
          socket.end();

          if (!cert || !cert.valid_to) {
            return resolve({ status: 'fail', reason: 'No certificate returned' });
          }

          const validTo = new Date(cert.valid_to);
          const daysRemaining = Math.floor((validTo - new Date()) / (1000 * 60 * 60 * 24));

          if (daysRemaining < 0) {
            return resolve({ status: 'fail', reason: 'Certificate expired', validTo: cert.valid_to });
          }
          if (!socket.authorized) {
            return resolve({ status: 'fail', reason: socket.authorizationError || 'Certificate not trusted' });
          }
          if (daysRemaining <= 30) {
            return resolve({ status: 'warning', reason: `Certificate expires in ${daysRemaining} days`, validTo: cert.valid_to });
          }

          return resolve({ status: 'pass', issuer: cert.issuer?.O, validTo: cert.valid_to, daysRemaining });
        } catch (err) {
          socket.end();
          resolve({ status: 'fail', reason: err.message });
        }
      }
    );

    socket.on('error', (err) => resolve({ status: 'fail', reason: err.code || err.message }));
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ status: 'fail', reason: 'Connection timed out' });
    });
  });
}

const MAX_LINKS_TO_CHECK = 40;
const CONCURRENCY = 5;

function extractLinks($, baseUrl) {
  const hrefs = new Set();
  $('a[href]').each((i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
      return;
    }
    try {
      const absolute = new URL(href, baseUrl).toString();
      hrefs.add(absolute);
    } catch (err) {
    }
  });
  return Array.from(hrefs).slice(0, MAX_LINKS_TO_CHECK);
}

async function checkSingleLink(url) {
  try {
    let response = await axios.head(url, { timeout: 8000, maxRedirects: 5, validateStatus: () => true });

    if (response.status === 405 || response.status === 501) {
      response = await axios.get(url, { timeout: 8000, maxRedirects: 5, validateStatus: () => true });
    }

    return { url, statusCode: response.status, ok: response.status < 400 };
  } catch (err) {
    return { url, statusCode: null, ok: false, error: err.code || err.message };
  }
}

async function runWithConcurrencyLimit(items, limit, worker) {
  const results = [];
  let index = 0;

  async function next() {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, next);
  await Promise.all(workers);
  return results;
}

async function checkBrokenLinks($, baseUrl) {
  const links = extractLinks($, baseUrl);
  if (links.length === 0) {
    return { status: 'pass', total: 0, broken: [] };
  }

  const results = await runWithConcurrencyLimit(links, CONCURRENCY, checkSingleLink);
  const broken = results.filter((r) => !r.ok);

  const brokenRatio = broken.length / results.length;
  let status = 'pass';
  if (brokenRatio > 0.2) status = 'fail';
  else if (brokenRatio > 0) status = 'warning';

  return {
    status,
    total: results.length,
    broken: broken.map((b) => ({ url: b.url, statusCode: b.statusCode, error: b.error })),
  };
}

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

function checkAiCrawlerAccess(baseUrl, robotsContent) {
  if (!robotsContent) {
    return { status: 'pass', allowed: AI_BOTS.length, total: AI_BOTS.length, blocked: [] };
  }

  const robotsUrl = new URL('/robots.txt', baseUrl).toString();
  const robots = robotsParser(robotsUrl, robotsContent);

  const blocked = AI_BOTS.filter((bot) => !robots.isAllowed(baseUrl, bot.name)).map((bot) => bot.name);
  const allowed = AI_BOTS.length - blocked.length;

  let status = 'pass';
  if (blocked.length > 0 && blocked.length < AI_BOTS.length) status = 'warning';
  if (blocked.length === AI_BOTS.length) status = 'fail';

  return { status, allowed, total: AI_BOTS.length, blocked };
}

function checkStructuredData($) {
  const scripts = $('script[type="application/ld+json"]');
  const types = [];

  scripts.each((i, el) => {
    try {
      const parsed = JSON.parse($(el).html());
      const items = Array.isArray(parsed) ? parsed : [parsed];
      items.forEach((item) => {
        if (item && item['@type']) types.push(item['@type']);
      });
    } catch (err) {
    }
  });

  if (types.length === 0) {
    return { status: 'fail', found: 0, types: [] };
  }
  return { status: 'pass', found: types.length, types };
}

async function checkLlmsTxt(baseUrl) {
  try {
    const llmsUrl = new URL('/llms.txt', baseUrl).toString();
    const response = await axios.get(llmsUrl, { timeout: 8000, validateStatus: () => true });

    if (response.status !== 200) {
      return { status: 'fail', reason: 'llms.txt not found' };
    }
    const content = (response.data || '').toString().trim();
    if (!content) {
      return { status: 'warning', reason: 'llms.txt is empty' };
    }
    return { status: 'pass', url: llmsUrl };
  } catch (err) {
    return { status: 'fail', reason: err.code || err.message };
  }
}

function checkSemanticHtml($) {
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

function checkJsDependence($) {
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const wordCount = bodyText ? bodyText.split(' ').length : 0;

  let status = 'pass';
  if (wordCount < 50) status = 'fail';
  else if (wordCount < 250) status = 'warning';

  return { status, wordCount };
}

async function checkAntiBotAccess(url) {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: { 'User-Agent': 'GPTBot/1.0' },
    });

    const statusCode = response.status;
    const xRobotsTag = response.headers['x-robots-tag'] || null;
    const blockedByTag = xRobotsTag && /noindex|noai/i.test(xRobotsTag);

    if (statusCode === 200 && !blockedByTag) {
      return { status: 'pass', statusCode, xRobotsTag };
    }
    if (statusCode === 403 || statusCode === 429 || statusCode === 503 || blockedByTag) {
      return { status: 'fail', statusCode, xRobotsTag, reason: 'AI bot user-agent appears blocked' };
    }
    return { status: 'warning', statusCode, xRobotsTag };
  } catch (err) {
    return { status: 'fail', reason: err.code || err.message };
  }
}

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

const STATUS_VALUE = { pass: 1, warning: 0.5, fail: 0 };

function computeScore(checks) {
  let earned = 0;
  let possible = 0;

  for (const [key, weight] of Object.entries(CHECK_WEIGHTS)) {
    const check = checks[key];
    if (!check) continue;
    possible += weight;
    earned += weight * (STATUS_VALUE[check.status] ?? 0);
  }

  const score = possible === 0 ? 0 : Math.round((earned / possible) * 100);

  let grade = 'F';
  if (score >= 90) grade = 'S';
  else if (score >= 80) grade = 'A';
  else if (score >= 70) grade = 'B';
  else if (score >= 60) grade = 'C';

  return { score, grade };
}

async function runAllChecks(normalizedUrl) {
  await assertUrlIsSafe(normalizedUrl);

  const parsed = new URL(normalizedUrl);
  const accessible = await checkAccessible(normalizedUrl);

  const checks = {
    accessible: {
      status: accessible.status,
      statusCode: accessible.statusCode,
      responseTimeMs: accessible.responseTimeMs,
      ...(accessible.error && { error: accessible.error }),
    },
  };

  if (accessible.html) {
    const $ = cheerio.load(accessible.html);
    checks.title = checkTitle($);
    checks.metaDescription = checkMetaDescription($);
    checks.viewport = checkViewport($);
    checks.imagesAlt = checkImagesAlt($);
    checks.brokenLinks = await checkBrokenLinks($, normalizedUrl);
    checks.structuredData = checkStructuredData($);
    checks.semanticHtml = checkSemanticHtml($);
    checks.jsDependence = checkJsDependence($);
  }

  const robots = await checkRobotsTxt(normalizedUrl);
  const sitemap = await checkSitemap(normalizedUrl, robots.content);
  checks.robotsTxt = { status: robots.status, ...(robots.reason && { reason: robots.reason }) };
  checks.sitemap = { status: sitemap.status, ...(sitemap.url && { url: sitemap.url }), ...(sitemap.reason && { reason: sitemap.reason }) };

  checks.ssl = await checkSSL(parsed.hostname);

  checks.aiCrawlerAccess = checkAiCrawlerAccess(normalizedUrl, robots.content);
  checks.antiBotAccess = await checkAntiBotAccess(normalizedUrl);
  checks.llmsTxt = await checkLlmsTxt(normalizedUrl);

  const { score, grade } = computeScore(checks);

  return { url: normalizedUrl, checkedAt: new Date().toISOString(), score, grade, checks };
}

const CRAWL_CHECK_KEYS = ['title', 'metaDescription', 'viewport', 'imagesAlt', 'brokenLinks', 'accessible', 'structuredData', 'semanticHtml', 'jsDependence'];
const FAIL_THRESHOLD = 0.2; 

function buildPageIssueDetail(key, data) {
  if (key === 'imagesAlt') {
    if (data.missingAltList && data.missingAltList.length > 0) {
      return data.missingAltList.join(', ');
    }
    return `${data.missingAlt} of ${data.total} images missing alt text`;
  }
  if (key === 'brokenLinks') {
    if (data.broken && data.broken.length > 0) {
      return data.broken.map((b) => `${b.url} (${b.statusCode ?? b.error})`).join('; ');
    }
    return 'Broken links detected';
  }
  if (key === 'title') {
    return data.value ? `"${data.value}" (${data.length} characters)` : 'No title found';
  }
  if (key === 'metaDescription') {
    return data.value ? `"${data.value}" (${data.length} characters)` : 'No meta description found';
  }
  if (key === 'viewport') {
    return data.value ? `Found: ${data.value}` : 'No viewport meta tag found';
  }
  if (key === 'accessible') {
    if (data.error) return `Error: ${data.error}`;
    return `Status code ${data.statusCode ?? 'N/A'}, responded in ${data.responseTimeMs}ms`;
  }
  if (key === 'structuredData') {
    return data.found > 0
      ? `${data.found} structured data block(s) found (${data.types.join(', ')})`
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

function aggregateCrawlChecks(pages) {
  const aggregated = {};

  for (const key of CRAWL_CHECK_KEYS) {
    const relevant = pages.filter((p) => p.checks[key]);
    const total = relevant.length;
    if (total === 0) continue;

    const failing = relevant.filter((p) => p.checks[key].status === 'fail').length;
    const warning = relevant.filter((p) => p.checks[key].status === 'warning').length;
    const failRatio = failing / total;

    let status = 'pass';
    if (failRatio > FAIL_THRESHOLD) status = 'fail';
    else if (failing > 0 || warning > 0) status = 'warning';

    const issues = relevant
      .filter((p) => p.checks[key].status !== 'pass')
      .map((p) => ({
        url: p.url,
        status: p.checks[key].status,
        detail: buildPageIssueDetail(key, p.checks[key]),
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

async function runCrawlChecks(normalizedUrl, maxPages) {
  await assertUrlIsSafe(normalizedUrl);

  const { crawlSite } = require('./crawler');
  const pages = await crawlSite(normalizedUrl, maxPages);

  const parsed = new URL(normalizedUrl);
  const robots = await checkRobotsTxt(normalizedUrl);
  const sitemap = await checkSitemap(normalizedUrl, robots.content);
  const ssl = await checkSSL(parsed.hostname);

  const checks = {
    ...aggregateCrawlChecks(pages),
    robotsTxt: { status: robots.status, ...(robots.reason && { reason: robots.reason }) },
    sitemap: { status: sitemap.status, ...(sitemap.url && { url: sitemap.url }), ...(sitemap.reason && { reason: sitemap.reason }) },
    ssl,
    // Site-level AI Visibility checks - run once on the homepage, not per-page
    aiCrawlerAccess: checkAiCrawlerAccess(normalizedUrl, robots.content),
    antiBotAccess: await checkAntiBotAccess(normalizedUrl),
    llmsTxt: await checkLlmsTxt(normalizedUrl),
  };

  const { score, grade } = computeScore(checks);

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

module.exports = {
  normalizeUrl, runAllChecks, runCrawlChecks,
  checkAccessible, checkTitle, checkMetaDescription, checkViewport, checkImagesAlt, checkBrokenLinks,
  checkStructuredData, checkSemanticHtml, checkJsDependence,
};