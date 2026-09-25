const cheerio = require('cheerio');
const axios = require('axios');
const puppeteer = require('puppeteer');

const {
  checkTitle, checkMetaDescription, checkViewport, checkImagesAlt, checkBrokenLinks,
  checkStructuredData, checkSemanticHtml, checkJsDependence,
} = require('./checks');

const CONCURRENCY = 2;

function isInternalLink(linkUrl, rootHostname) {
  try {
    const parsed = new URL(linkUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return parsed.hostname === rootHostname || parsed.hostname.endsWith('.' + rootHostname);
  } catch (err) {
    return false;
  }
}

function extractInternalLinks($, baseUrl, rootHostname) {
  const hrefs = new Set();
  $('a[href]').each((i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
      return;
    }
    try {
      const absolute = new URL(href, baseUrl).toString();
      const clean = absolute.split('#')[0];
      if (isInternalLink(clean, rootHostname)) {
        hrefs.add(clean);
      }
    } catch (err) {
    }
  });
  return Array.from(hrefs);
}

async function fetchRenderedPage(browser, pageUrl) {
  const page = await browser.newPage();
  const start = Date.now();
  try {
    const response = await page.goto(pageUrl, { waitUntil: 'networkidle0', timeout: 15000 });
    const responseTimeMs = Date.now() - start;
    const statusCode = response ? response.status() : null;
    const html = await page.content();
    await page.close();

    let status = 'fail';
    if (statusCode >= 200 && statusCode < 300) {
      status = responseTimeMs > 3000 ? 'warning' : 'pass';
    }
    return { status, statusCode, responseTimeMs, html };
  } catch (err) {
    await page.close();
    return { status: 'fail', statusCode: null, responseTimeMs: Date.now() - start, error: err.message, html: null };
  }
}

async function checkJsDependenceForPage(pageUrl) {
  try {
    const response = await axios.get(pageUrl, { timeout: 10000, validateStatus: () => true });
    if (typeof response.data !== 'string') {
      return { status: 'fail', wordCount: 0 };
    }
    const $raw = cheerio.load(response.data);
    return checkJsDependence($raw);
  } catch (err) {
    return { status: 'fail', wordCount: 0, error: err.code || err.message };
  }
}

async function checkOnePage(browser, pageUrl) {
  const accessible = await fetchRenderedPage(browser, pageUrl);

  const pageResult = {
    url: pageUrl,
    checks: {
      accessible: {
        status: accessible.status,
        statusCode: accessible.statusCode,
        responseTimeMs: accessible.responseTimeMs,
        ...(accessible.error && { error: accessible.error }),
      },
    },
  };

  if (accessible.html) {
    const $ = cheerio.load(accessible.html);
    pageResult.checks.title = checkTitle($);
    pageResult.checks.metaDescription = checkMetaDescription($);
    pageResult.checks.viewport = checkViewport($);
    pageResult.checks.imagesAlt = checkImagesAlt($);
    pageResult.checks.brokenLinks = await checkBrokenLinks($, pageUrl);
    pageResult.checks.structuredData = checkStructuredData($);
    pageResult.checks.semanticHtml = checkSemanticHtml($);
    pageResult.$ = $;
  }

  pageResult.checks.jsDependence = await checkJsDependenceForPage(pageUrl);

  return pageResult;
}

async function crawlSite(rootUrl, maxPages) {
  const rootHostname = new URL(rootUrl).hostname;
  const visited = new Set();
  const queue = [rootUrl];
  const pages = [];

  const browser = await puppeteer.launch({ headless: 'new' });

  try {
    while (queue.length > 0 && pages.length < maxPages) {
      const remaining = maxPages - pages.length;
      const batch = [];
      while (batch.length < CONCURRENCY && batch.length < remaining && queue.length > 0) {
        const next = queue.shift();
        if (visited.has(next)) continue;
        visited.add(next);
        batch.push(next);
      }
      if (batch.length === 0) break;

      const results = await Promise.all(batch.map((pageUrl) => checkOnePage(browser, pageUrl)));

      for (const result of results) {
        if (result.$) {
          const links = extractInternalLinks(result.$, result.url, rootHostname);
          for (const link of links) {
            if (!visited.has(link) && !queue.includes(link)) {
              queue.push(link);
            }
          }
          delete result.$;
        }
        pages.push(result);
      }
    }
  } finally {
    await browser.close();
  }

  return pages;
}

module.exports = { crawlSite, isInternalLink, extractInternalLinks };