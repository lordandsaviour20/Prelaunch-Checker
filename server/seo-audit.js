const axios = require('axios');
const cheerio = require('cheerio');


function finding(id, label, severity, detail, recommendation = null) {
  return { id, label, severity, detail, recommendation };
}

// ---------- 1. Meta Tag Analyzer ----------

function analyzeMetaTags($, pageUrl) {
  const findings = [];

  const title = $('title').first().text().trim();
  if (!title) {
    findings.push(finding('title', 'Title Tag', 'critical', 'No <title> tag found.', 'Add a unique, descriptive title tag (ideally 50-60 characters).'));
  } else if (title.length < 30 || title.length > 65) {
    findings.push(finding('title', 'Title Tag', 'warning', `Title is ${title.length} characters: "${title}"`, 'Aim for roughly 50-60 characters so it displays fully in search results.'));
  } else {
    findings.push(finding('title', 'Title Tag', 'passed', `"${title}" (${title.length} characters)`));
  }

  const description = $('meta[name="description"]').attr('content')?.trim() || '';
  if (!description) {
    findings.push(finding('metaDescription', 'Meta Description', 'critical', 'No meta description found.', 'Add a meta description summarizing the page (roughly 150-160 characters).'));
  } else if (description.length < 120 || description.length > 165) {
    findings.push(finding('metaDescription', 'Meta Description', 'warning', `Description is ${description.length} characters: "${description}"`, 'Aim for roughly 150-160 characters.'));
  } else {
    findings.push(finding('metaDescription', 'Meta Description', 'passed', `"${description}" (${description.length} characters)`));
  }

  const canonicalCount = $('link[rel="canonical"]').length;
  if (canonicalCount === 0) {
    findings.push(finding('canonicalPresence', 'Canonical URL', 'warning', 'No canonical link tag found.', 'Add a <link rel="canonical"> tag to avoid duplicate-content issues.'));
  } else if (canonicalCount > 1) {
    findings.push(finding('canonicalPresence', 'Canonical URL', 'critical', `${canonicalCount} canonical tags found (should be exactly one).`, 'Remove duplicate canonical tags — only one should be present.'));
  } else {
    findings.push(finding('canonicalPresence', 'Canonical URL', 'passed', $('link[rel="canonical"]').attr('href') || ''));
  }

  const robotsMeta = $('meta[name="robots"]').attr('content') || '';
  if (robotsMeta && /noindex/i.test(robotsMeta)) {
    findings.push(finding('robotsMeta', 'Robots Meta Tag', 'critical', `Robots meta tag says: "${robotsMeta}"`, 'This page is set to noindex — remove this if the page should appear in search results.'));
  } else if (robotsMeta) {
    findings.push(finding('robotsMeta', 'Robots Meta Tag', 'passed', `"${robotsMeta}"`));
  } else {
    findings.push(finding('robotsMeta', 'Robots Meta Tag', 'passed', 'No robots meta tag (defaults to indexable).'));
  }

  const viewport = $('meta[name="viewport"]').attr('content') || '';
  if (!viewport) {
    findings.push(finding('viewport', 'Viewport Meta Tag', 'critical', 'No viewport meta tag found.', 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.'));
  } else if (!viewport.includes('width=device-width')) {
    findings.push(finding('viewport', 'Viewport Meta Tag', 'warning', `Found: "${viewport}"`, 'Include width=device-width for proper mobile scaling.'));
  } else {
    findings.push(finding('viewport', 'Viewport Meta Tag', 'passed', `"${viewport}"`));
  }

  const lang = $('html').attr('lang');
  if (!lang) {
    findings.push(finding('langAttribute', 'Language Attribute', 'warning', 'No lang attribute on <html>.', 'Add a lang attribute (e.g. lang="en") to help search engines and screen readers.'));
  } else {
    findings.push(finding('langAttribute', 'Language Attribute', 'passed', `lang="${lang}"`));
  }

  const ogTags = ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'];
  const missingOg = ogTags.filter((tag) => !$(`meta[property="${tag}"]`).attr('content'));
  if (missingOg.length === ogTags.length) {
    findings.push(finding('openGraph', 'Open Graph Tags', 'warning', 'No Open Graph tags found.', 'Add og:title, og:description, og:image, og:url, and og:type for better social sharing previews.'));
  } else if (missingOg.length > 0) {
    findings.push(finding('openGraph', 'Open Graph Tags', 'warning', `Missing: ${missingOg.join(', ')}`, 'Add the missing Open Graph tags for a complete social preview.'));
  } else {
    findings.push(finding('openGraph', 'Open Graph Tags', 'passed', 'All core Open Graph tags present.'));
  }

  const twitterCard = $('meta[name="twitter:card"]').attr('content');
  if (!twitterCard) {
    findings.push(finding('twitterCard', 'Twitter/X Card', 'warning', 'No twitter:card tag found.', 'Add twitter:card, twitter:title, twitter:description, and twitter:image tags.'));
  } else {
    findings.push(finding('twitterCard', 'Twitter/X Card', 'passed', `twitter:card="${twitterCard}"`));
  }

  return findings;
}

// ---------- 2. Heading Structure Analyzer ----------

function analyzeHeadings($) {
  const findings = [];

  const headingTree = [];
  $('h1, h2, h3, h4, h5, h6').each((i, el) => {
    const tag = el.tagName.toLowerCase();
    const level = parseInt(tag[1], 10);
    const text = $(el).text().trim();
    headingTree.push({ level, tag, text });
  });

  const h1s = headingTree.filter((h) => h.level === 1);
  if (h1s.length === 0) {
    findings.push(finding('h1Exists', 'H1 Tag', 'critical', 'No H1 tag found on the page.', 'Add exactly one H1 tag describing the page\'s main topic.'));
  } else if (h1s.length > 1) {
    findings.push(finding('h1Exists', 'H1 Tag', 'warning', `${h1s.length} H1 tags found: ${h1s.map((h) => `"${h.text}"`).join(', ')}`, 'Use a single H1 per page for the clearest content hierarchy.'));
  } else {
    findings.push(finding('h1Exists', 'H1 Tag', 'passed', `"${h1s[0].text}"`));
  }

  const emptyHeadings = headingTree.filter((h) => !h.text);
  if (emptyHeadings.length > 0) {
    findings.push(finding('emptyHeadings', 'Empty Headings', 'warning', `${emptyHeadings.length} empty heading tag(s) found.`, 'Remove empty heading tags or add meaningful text to them.'));
  } else {
    findings.push(finding('emptyHeadings', 'Empty Headings', 'passed', 'No empty headings found.'));
  }

  const longHeadings = headingTree.filter((h) => h.text.length > 70);
  if (longHeadings.length > 0) {
    findings.push(finding('longHeadings', 'Excessively Long Headings', 'warning', `${longHeadings.length} heading(s) over 70 characters.`, 'Keep headings concise — long headings can hurt readability and hierarchy clarity.'));
  } else {
    findings.push(finding('longHeadings', 'Excessively Long Headings', 'passed', 'All headings are a reasonable length.'));
  }

  let skippedLevels = [];
  let previousLevel = 0;
  for (const h of headingTree) {
    if (previousLevel > 0 && h.level > previousLevel + 1) {
      skippedLevels.push(`H${previousLevel} → H${h.level} ("${h.text}")`);
    }
    previousLevel = h.level;
  }
  if (skippedLevels.length > 0) {
    findings.push(finding('skippedLevels', 'Heading Hierarchy', 'warning', `Skipped level(s): ${skippedLevels.join('; ')}`, 'Avoid skipping heading levels (e.g. H1 straight to H3) — it can confuse content structure and accessibility tools. This is a warning, not a fatal error.'));
  } else if (headingTree.length > 0) {
    findings.push(finding('skippedLevels', 'Heading Hierarchy', 'passed', 'No skipped heading levels detected.'));
  }

  return { findings, tree: headingTree };
}


// ---------- 3. Image SEO Analyzer ----------

const MAX_IMAGES_TO_CHECK = 30;
const IMAGE_CONCURRENCY = 5;

function filenameFromUrl(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || url;
  } catch (err) {
    const parts = url.split('/').filter(Boolean);
    return parts[parts.length - 1] || url;
  }
}

// Flags generic camera/CMS-generated filenames: IMG_2398.jpg, DSC0001.png, image1.jpg, photo (2).jpg
function isPoorFilename(filename) {
  return /^(img|dsc|image|photo|screenshot|untitled)[-_ ]?\(?\d*\)?\.[a-z]+$/i.test(filename.trim());
}

function extractImageDetails($, baseUrl) {
  const images = [];
  $('img').each((i, el) => {
    const $el = $(el);
    const src = $el.attr('src') || $el.attr('data-src') || '';
    if (!src) return;
    let absoluteUrl;
    try {
      absoluteUrl = new URL(src, baseUrl).toString();
    } catch (err) {
      absoluteUrl = src;
    }
    images.push({
      src: absoluteUrl,
      alt: $el.attr('alt'),
      width: $el.attr('width'),
      height: $el.attr('height'),
      loading: $el.attr('loading'),
    });
  });
  return images;
}

// Synchronous part - everything readable straight from the HTML, no network calls
function analyzeImages($, pageUrl) {
  const findings = [];
  const images = extractImageDetails($, pageUrl);
  const total = images.length;

  if (total === 0) {
    findings.push(finding('imagesPresent', 'Images Found', 'passed', 'No images found on this page.'));
    return { findings, images: [] };
  }

  const missingAlt = images.filter((img) => img.alt === undefined || img.alt === null);
  const emptyAlt = images.filter((img) => img.alt !== undefined && img.alt !== null && img.alt.trim() === '');
  const longAlt = images.filter((img) => img.alt && img.alt.length > 125);
  const missingDimensions = images.filter((img) => !img.width || !img.height);
  const noLazyLoad = images.filter((img, idx) => idx > 2 && img.loading !== 'lazy'); // first few assumed above-the-fold
  const poorFilenames = images.filter((img) => isPoorFilename(filenameFromUrl(img.src)));

  findings.push(
    missingAlt.length > 0
      ? finding('missingAlt', 'Missing ALT Attributes', 'critical', `${missingAlt.length} of ${total} images have no alt attribute at all.`, 'Add descriptive alt text to every meaningful image.')
      : finding('missingAlt', 'Missing ALT Attributes', 'passed', 'All images have an alt attribute.')
  );

  findings.push(
    emptyAlt.length > 0
      ? finding('emptyAlt', 'Empty ALT Text', 'warning', `${emptyAlt.length} image(s) have alt="" (fine only for purely decorative images).`, 'Confirm these images are decorative; otherwise add descriptive alt text.')
      : finding('emptyAlt', 'Empty ALT Text', 'passed', 'No empty alt attributes found.')
  );

  findings.push(
    longAlt.length > 0
      ? finding('longAlt', 'Excessively Long ALT Text', 'warning', `${longAlt.length} image(s) have alt text over 125 characters.`, 'Keep alt text concise and descriptive - aim under ~125 characters.')
      : finding('longAlt', 'Excessively Long ALT Text', 'passed', 'Alt text lengths look reasonable.')
  );

  findings.push(
    missingDimensions.length > 0
      ? finding('missingDimensions', 'Width/Height Attributes', 'warning', `${missingDimensions.length} of ${total} images are missing width/height attributes.`, 'Add explicit width and height attributes to prevent layout shift (CLS) while images load.')
      : finding('missingDimensions', 'Width/Height Attributes', 'passed', 'All images specify width and height.')
  );

  findings.push(
    noLazyLoad.length > 0
      ? finding('lazyLoading', 'Lazy Loading', 'warning', `${noLazyLoad.length} below-the-fold image(s) are not using loading="lazy".`, 'Add loading="lazy" to images that are not immediately visible on page load.')
      : finding('lazyLoading', 'Lazy Loading', 'passed', 'Lazy loading looks appropriately applied.')
  );

  findings.push(
    poorFilenames.length > 0
      ? finding('filenameQuality', 'Filename Quality', 'warning', `${poorFilenames.length} image(s) use generic filenames (e.g. "${filenameFromUrl(poorFilenames[0].src)}").`, 'Rename image files descriptively - e.g. "blue-sapphire-ring.jpg" instead of "IMG_2398.jpg".')
      : finding('filenameQuality', 'Filename Quality', 'passed', 'Image filenames look descriptive.')
  );

  return { findings, images };
}

// Small local concurrency-limited runner (mirrors the one in checks.js, kept
// local here so seo-audit.js doesn't need to depend on checks.js internals).
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

// Async part - file size + format, requires a HEAD request per image.
// Capped and concurrency-limited so a page with hundreds of images can't
// turn this into an uncontrolled crawl of someone's image CDN.
async function analyzeImageMetadata(images) {
  const capped = images.slice(0, MAX_IMAGES_TO_CHECK);
  const findings = [];

  if (capped.length === 0) {
    return { findings, imagesWithMetadata: [] };
  }

  const results = await runWithConcurrencyLimit(capped, IMAGE_CONCURRENCY, async (img) => {
    try {
      const response = await axios.head(img.src, { timeout: 8000, validateStatus: () => true });
      const sizeBytes = parseInt(response.headers['content-length'], 10) || null;
      const contentType = response.headers['content-type'] || null;
      return { ...img, sizeBytes, contentType, statusCode: response.status };
    } catch (err) {
      return { ...img, sizeBytes: null, contentType: null, error: err.code || err.message };
    }
  });

  const oversized = results.filter((img) => img.sizeBytes && img.sizeBytes > 300 * 1024); // > 300KB
  const modernFormats = ['image/webp', 'image/avif'];
  const legacyFormat = results.filter(
    (img) => img.contentType && !modernFormats.includes(img.contentType) && /image\/(jpeg|png)/i.test(img.contentType)
  );

  findings.push(
    oversized.length > 0
      ? finding('imageFileSize', 'Image File Size', 'warning', `${oversized.length} image(s) are over 300KB.`, 'Compress large images or serve responsively-sized versions.')
      : finding('imageFileSize', 'Image File Size', 'passed', 'No excessively large images detected.')
  );

  findings.push(
    legacyFormat.length > 0
      ? finding('imageFormat', 'Image Format', 'warning', `${legacyFormat.length} image(s) use JPEG/PNG instead of a modern format.`, 'Consider serving images as WebP or AVIF for smaller file sizes.')
      : finding('imageFormat', 'Image Format', 'passed', 'Images use modern or appropriately chosen formats.')
  );

  return { findings, imagesWithMetadata: results };
}

// ---------- 4. URL SEO Analyzer ----------

function analyzeUrl(pageUrl) {
  const findings = [];
  const parsed = new URL(pageUrl);

  findings.push(
    parsed.protocol === 'https:'
      ? finding('urlHttps', 'HTTPS', 'passed', 'URL uses HTTPS.')
      : finding('urlHttps', 'HTTPS', 'critical', `URL uses ${parsed.protocol.replace(':', '')} instead of HTTPS.`, 'Serve the page over HTTPS.')
  );

  findings.push(
    pageUrl.length > 100
      ? finding('urlLength', 'URL Length', 'warning', `URL is ${pageUrl.length} characters.`, 'Shorten the URL where possible - aim under roughly 75-100 characters.')
      : finding('urlLength', 'URL Length', 'passed', `URL is ${pageUrl.length} characters.`)
  );

  findings.push(
    /[A-Z]/.test(parsed.pathname)
      ? finding('urlUppercase', 'Uppercase Characters', 'warning', 'URL path contains uppercase characters.', 'Use lowercase-only URLs to avoid duplicate-content issues from case-sensitive servers.')
      : finding('urlUppercase', 'Uppercase Characters', 'passed', 'URL path is lowercase.')
  );

  findings.push(
    /\s|%20/.test(pageUrl)
      ? finding('urlSpaces', 'Spaces in URL', 'critical', 'URL contains spaces (or encoded spaces).', 'Remove spaces from the URL path.')
      : finding('urlSpaces', 'Spaces in URL', 'passed', 'No spaces found in URL.')
  );

  findings.push(
    /[^a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]/.test(pageUrl)
      ? finding('urlSpecialChars', 'Special Characters', 'warning', 'URL contains unusual special characters.', 'Stick to letters, numbers, and hyphens in URL paths.')
      : finding('urlSpecialChars', 'Special Characters', 'passed', 'No unusual special characters found.')
  );

  const paramCount = Array.from(parsed.searchParams.keys()).length;
  findings.push(
    paramCount > 3
      ? finding('urlQueryParams', 'Query Parameters', 'warning', `URL has ${paramCount} query parameters.`, 'Excessive query parameters can create duplicate-content and crawl-budget issues - consider clean paths instead.')
      : finding('urlQueryParams', 'Query Parameters', 'passed', `URL has ${paramCount} query parameter(s).`)
  );

  findings.push(
    /_/.test(parsed.pathname)
      ? finding('urlUnderscores', 'Underscores vs Hyphens', 'warning', 'URL path uses underscores.', 'Use hyphens instead of underscores as word separators - search engines treat hyphens as word breaks.')
      : finding('urlUnderscores', 'Underscores vs Hyphens', 'passed', 'No underscores found in URL path.')
  );

  // Trailing-slash and readability are single-URL observations, not
  // pass/fail judgments - true "consistency" needs multiple URLs to assess,
  // which is out of scope for a single-page check.
  const hasTrailingSlash = parsed.pathname.length > 1 && parsed.pathname.endsWith('/');
  findings.push(
    finding(
      'urlTrailingSlash',
      'Trailing Slash',
      'passed',
      hasTrailingSlash ? 'URL path ends with a trailing slash.' : 'URL path has no trailing slash.',
      'Ensure this is applied consistently site-wide (either always or never) to avoid duplicate-content issues.'
    )
  );

  const segments = parsed.pathname.split('/').filter(Boolean);
  const looksLikeId = segments.some((seg) => /^[0-9a-f]{8,}$/i.test(seg) || /^\d+$/.test(seg));
  findings.push(
    looksLikeId
      ? finding('urlReadability', 'Readability', 'warning', 'URL path contains numeric IDs or hash-like segments.', 'Consider using descriptive slugs (e.g. /products/blue-sapphire-ring) instead of raw IDs where possible.')
      : finding('urlReadability', 'Readability', 'passed', 'URL path looks reasonably descriptive.')
  );

  return findings;
}

// ---------- 5. Canonical URL Checker ----------

async function analyzeCanonical($, pageUrl) {
    const findings = [];
    const canonicalTags = $('link[rel="canonical"]');
    const count = canonicalTags.length;
  
    if (count === 0) {
      findings.push(finding('canonicalExists', 'Canonical Tag Exists', 'warning', 'No canonical link tag found.', 'Add a <link rel="canonical"> tag to avoid duplicate-content issues.'));
      return { findings, canonicalUrl: null, isSelfReferencing: null };
    }
  
    if (count > 1) {
      findings.push(finding('canonicalExists', 'Canonical Tag Exists', 'critical', `${count} canonical tags found (should be exactly one).`, 'Remove duplicate canonical tags - only one should be present.'));
      // Still evaluate the first one found, since that's what browsers/crawlers will typically honor
    } else {
      findings.push(finding('canonicalExists', 'Canonical Tag Exists', 'passed', 'Exactly one canonical tag found.'));
    }
  
    const rawHref = canonicalTags.first().attr('href') || '';
    let canonicalUrl;
    try {
      canonicalUrl = new URL(rawHref, pageUrl).toString();
    } catch (err) {
      findings.push(finding('canonicalAbsolute', 'Absolute URL', 'critical', `Canonical href "${rawHref}" is not a valid URL.`, 'Use a full, valid absolute URL in the canonical tag.'));
      return { findings, canonicalUrl: null, isSelfReferencing: null };
    }
  
    findings.push(
      /^https?:\/\//i.test(rawHref)
        ? finding('canonicalAbsolute', 'Absolute URL', 'passed', 'Canonical URL is absolute.')
        : finding('canonicalAbsolute', 'Absolute URL', 'warning', `Canonical href "${rawHref}" is relative.`, 'Use an absolute URL (including https://) in the canonical tag - relative canonicals are handled inconsistently by crawlers.')
    );
  
    const canonicalParsed = new URL(canonicalUrl);
    findings.push(
      canonicalParsed.protocol === 'https:'
        ? finding('canonicalHttps', 'Canonical Uses HTTPS', 'passed', 'Canonical URL uses HTTPS.')
        : finding('canonicalHttps', 'Canonical Uses HTTPS', 'warning', 'Canonical URL does not use HTTPS.', 'Point the canonical tag at the HTTPS version of the URL.')
    );
  
    const normalize = (u) => u.replace(/\/$/, '').toLowerCase();
    const isSelfReferencing = normalize(canonicalUrl) === normalize(pageUrl);
    findings.push(
      isSelfReferencing
        ? finding('canonicalSelfRef', 'Self-Referencing', 'passed', 'Canonical URL matches this page (self-referencing).')
        : finding('canonicalSelfRef', 'Self-Referencing', 'warning', `Canonical points to a different URL: ${canonicalUrl}`, 'Confirm this is intentional - if this page is not a duplicate of another, its canonical should point to itself.')
    );
  
    // Check the canonical target is actually reachable (not itself broken/redirecting into an error)
    try {
      const response = await axios.get(canonicalUrl, { timeout: 8000, maxRedirects: 5, validateStatus: () => true });
      if (response.status >= 400) {
        findings.push(finding('canonicalTargetStatus', 'Canonical Target Availability', 'critical', `Canonical target returned status ${response.status}.`, 'Fix the canonical target so it resolves successfully - a broken canonical target undermines the tag entirely.'));
      } else if (response.status >= 300) {
        findings.push(finding('canonicalTargetStatus', 'Canonical Target Availability', 'warning', `Canonical target redirects (status ${response.status}).`, 'Point the canonical directly at the final URL rather than one that redirects.'));
      } else {
        findings.push(finding('canonicalTargetStatus', 'Canonical Target Availability', 'passed', 'Canonical target is reachable and returns a success status.'));
      }
    } catch (err) {
      findings.push(finding('canonicalTargetStatus', 'Canonical Target Availability', 'critical', `Could not reach canonical target: ${err.code || err.message}`, 'Ensure the canonical URL is reachable.'));
    }
  
    return { findings, canonicalUrl, isSelfReferencing };
  }
  
  // ---------- 15. Indexability Checker ----------
  // Takes already-computed signals from other analyzers rather than re-deriving
  // them, so this verdict can never quietly disagree with the canonical/meta
  // findings sitting right next to it in the report.
  
  async function analyzeIndexability({ $, pageUrl, statusCode, robotsMetaContent, xRobotsTagHeader, canonicalUrl, isSelfReferencing }) {
    const reasons = [];
    let verdict = 'Indexable';
  
    if (statusCode && statusCode >= 400) {
      verdict = 'Not indexable';
      reasons.push(`Page returned HTTP status ${statusCode}.`);
    }
  
    if (robotsMetaContent && /noindex/i.test(robotsMetaContent)) {
      verdict = 'Not indexable';
      reasons.push(`Robots meta tag contains "noindex" (content="${robotsMetaContent}").`);
    }
  
    if (xRobotsTagHeader && /noindex/i.test(xRobotsTagHeader)) {
      verdict = 'Not indexable';
      reasons.push(`X-Robots-Tag response header contains "noindex" (value: "${xRobotsTagHeader}").`);
    }
  
    let robotsTxtBlocked = 'uncertain';
    try {
      const robotsUrl = new URL('/robots.txt', pageUrl).toString();
      const response = await axios.get(robotsUrl, { timeout: 8000, validateStatus: () => true });
      if (response.status === 200) {
        const content = (response.data || '').toString();
        const disallowsAll = /User-agent:\s*\*\s*\n\s*Disallow:\s*\/\s*$/im.test(content);
        robotsTxtBlocked = disallowsAll;
        if (disallowsAll) {
          verdict = 'Not indexable';
          reasons.push('robots.txt disallows all crawling for this path.');
        }
      }
    } catch (err) {
      robotsTxtBlocked = 'uncertain';
      reasons.push('Could not verify robots.txt (request failed) - crawl restrictions are uncertain.');
      if (verdict === 'Indexable') verdict = 'Uncertain';
    }
  
    if (canonicalUrl && isSelfReferencing === false) {
      reasons.push(`Canonical points to a different URL (${canonicalUrl}) - search engines may index that URL instead of this one.`);
      if (verdict === 'Indexable') verdict = 'Uncertain';
    }
  
    if (reasons.length === 0) {
      reasons.push('No indexing restrictions detected in robots.txt, robots meta tag, X-Robots-Tag header, canonical, or HTTP status.');
    }
  
    const severity = verdict === 'Indexable' ? 'passed' : verdict === 'Uncertain' ? 'warning' : 'critical';
  
    const findings = [
      finding(
        'indexability',
        'Indexability',
        severity,
        `${verdict}. ${reasons.join(' ')}`,
        verdict !== 'Indexable' ? 'Review the listed signal(s) if you want this page to appear in search results.' : null
      ),
    ];
  
    return { findings, verdict, reasons };
  }
  
  // ---------- Scoring & report assembly ----------
  
  const MODULE_LABELS = {
    metaTags: 'Meta Tags',
    headings: 'Heading Structure',
    images: 'Images',
    url: 'URL Structure',
    canonical: 'Canonical URL',
    indexability: 'Indexability',
  };
   
  // Module-level weights (sum to 100). Indexability weighted highest - a page
  // that can't be indexed makes every other signal moot. URL structure lowest -
  // real but rarely make-or-break on its own.
  const MODULE_WEIGHTS = {
    indexability: 25,
    metaTags: 20,
    canonical: 15,
    headings: 15,
    images: 15,
    url: 10,
  };
   
  const SEVERITY_VALUE = { passed: 1, warning: 0.5, critical: 0 };
   
  // A module's own sub-score (0-100), from only its own findings - this is
  // what stops a finding-heavy module (Meta Tags: 8 findings) from drowning
  // out a finding-light one (Indexability: 1 finding) before weighting.
  function computeModuleSubScore(findings) {
    if (!findings || findings.length === 0) return null;
    let earned = 0;
    for (const f of findings) {
      earned += SEVERITY_VALUE[f.severity] ?? 0;
    }
    return Math.round((earned / findings.length) * 100);
  }
   
  // Shared by both buildAuditReport (single page) and runSeoAuditCrawl
  // (aggregated), so the two scoring paths can never silently diverge.
  function scoreModules(moduleSummaries) {
    let critical = 0;
    let warning = 0;
    let passed = 0;
    const moduleScores = [];
   
    for (const [key, mod] of Object.entries(moduleSummaries)) {
      const findings = mod.findings || [];
      for (const f of findings) {
        if (f.severity === 'critical') critical++;
        else if (f.severity === 'warning') warning++;
        else passed++;
      }
   
      const subScore = computeModuleSubScore(findings);
      if (subScore !== null) {
        moduleScores.push({
          key,
          label: mod.label || MODULE_LABELS[key] || key,
          score: subScore,
          weight: MODULE_WEIGHTS[key] ?? 0,
          findingCount: findings.length,
        });
      }
    }
   
    const totalWeight = moduleScores.reduce((sum, m) => sum + m.weight, 0);
    let score = totalWeight === 0
      ? 0
      : Math.round(moduleScores.reduce((sum, m) => sum + m.score * m.weight, 0) / totalWeight);
   
    // Hard cap: any critical Indexability finding caps the overall score,
    // regardless of how well everything else scores - a page that can't be
    // indexed shouldn't be able to "average its way" to a good grade.
    let overallCapped = false;
    const indexabilityCritical = moduleSummaries.indexability?.findings?.some((f) => f.severity === 'critical');
    if (indexabilityCritical && score > 40) {
      score = 40;
      overallCapped = true;
    }
   
    const total = critical + warning + passed;
    return { score, overallCapped, summary: { critical, warning, passed, total }, moduleScores };
  }
   
  function buildAuditReport(pageUrl, modules) {
    const { score, overallCapped, summary, moduleScores } = scoreModules(modules);
    return {
      url: pageUrl,
      checkedAt: new Date().toISOString(),
      score,
      overallCapped,
      summary,
      moduleScores,
      modules,
    };
  }
  

  function isInternalLink(linkUrl, rootHostname) {
    try {
      const parsed = new URL(linkUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
      return parsed.hostname === rootHostname || parsed.hostname.endsWith('.' + rootHostname);
    } catch (err) {
      return false;
    }
  }
   
  function extractInternalLinksFromHtml($, baseUrl, rootHostname) {
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
        // Malformed href, skip it
      }
    });
    return Array.from(hrefs);
  }
   
  async function runSeoAudit(pageUrl, options = {}) {
    const { rootHostname } = options;
  
    let response;
    try {
      response = await axios.get(pageUrl, {
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: () => true,
      });
    } catch (err) {
      const modules = {
        indexability: {
          findings: [
            finding(
              'pageAccessible',
              'Page Accessible',
              'critical',
              `Could not load this page: ${err.code || err.message}`,
              'Check that the site is reachable and serves a complete, valid SSL certificate chain (including intermediate certificates).'
            ),
          ],
        },
      };
      const report = buildAuditReport(pageUrl, modules);
      return rootHostname ? { ...report, internalLinks: [] } : report;
    }
   
    const statusCode = response.status;
    const html = typeof response.data === 'string' ? response.data : '';
    const xRobotsTagHeader = response.headers['x-robots-tag'] || null;
   
    const modules = {};
   
    if (!html) {
      modules.indexability = await analyzeIndexability({
        pageUrl,
        statusCode,
        robotsMetaContent: null,
        xRobotsTagHeader,
        canonicalUrl: null,
        isSelfReferencing: null,
      });
      const report = buildAuditReport(pageUrl, modules);
      return rootHostname ? { ...report, internalLinks: [] } : report;
    }
   
    const $ = cheerio.load(html);
   
    modules.metaTags = { findings: analyzeMetaTags($, pageUrl) };
    modules.headings = analyzeHeadings($);
   
    const imageBase = analyzeImages($, pageUrl);
    const imageMeta = await analyzeImageMetadata(imageBase.images);
    modules.images = { findings: [...imageBase.findings, ...imageMeta.findings] };
   
    modules.url = { findings: analyzeUrl(pageUrl) };
   
    const canonicalResult = await analyzeCanonical($, pageUrl);
    modules.canonical = canonicalResult;
   
    const robotsMetaContent = $('meta[name="robots"]').attr('content') || null;
    modules.indexability = await analyzeIndexability({
      $,
      pageUrl,
      statusCode,
      robotsMetaContent,
      xRobotsTagHeader,
      canonicalUrl: canonicalResult.canonicalUrl,
      isSelfReferencing: canonicalResult.isSelfReferencing,
    });
   
    const report = buildAuditReport(pageUrl, modules);
   
    // Only extract links in crawl mode - a single-page audit has no use for them,
    // and this reuses the $ already loaded above rather than re-fetching.
    if (rootHostname) {
      const internalLinks = extractInternalLinksFromHtml($, pageUrl, rootHostname);
      return { ...report, internalLinks };
    }
   
    return report;
  }
   
  // ============================================================
  // CHANGE 2: add everything below as new code (crawl + aggregation),
  // and update the final module.exports to include runSeoAuditCrawl.
  // ============================================================
   
  const SEO_CRAWL_CONCURRENCY = 2;
   
  async function crawlSeoAudit(rootUrl, maxPages) {
    const rootHostname = new URL(rootUrl).hostname;
    const visited = new Set();
    const queue = [rootUrl];
    const pages = [];
   
    while (queue.length > 0 && pages.length < maxPages) {
      const remaining = maxPages - pages.length;
      const batch = [];
      while (batch.length < SEO_CRAWL_CONCURRENCY && batch.length < remaining && queue.length > 0) {
        const next = queue.shift();
        if (visited.has(next)) continue;
        visited.add(next);
        batch.push(next);
      }
      if (batch.length === 0) break;
   
      const results = await Promise.all(
        batch.map((pageUrl) =>
          runSeoAudit(pageUrl, { rootHostname }).catch((err) => ({
            url: pageUrl,
            modules: {},
            summary: { critical: 0, warning: 0, passed: 0, total: 0 },
            score: 0,
            internalLinks: [],
            fetchError: err.message,
          }))
        )
      );
   
      for (const result of results) {
        const { internalLinks = [], ...pageReport } = result;
        pages.push(pageReport);
        for (const link of internalLinks) {
          if (!visited.has(link) && !queue.includes(link)) {
            queue.push(link);
          }
        }
      }
    }
   
    return pages;
  }
   
  // Aggregates per-finding (by id) across every crawled page - e.g. "Title Tag"
  // becomes one row saying "6 of 8 pages passing" with a per-page issue list,
  // same shape/spirit as your existing checks.js aggregateCrawlChecks.
  function aggregateSeoModules(pages) {
    const moduleKeys = new Set();
    pages.forEach((p) => Object.keys(p.modules || {}).forEach((k) => moduleKeys.add(k)));
   
    const aggregatedModules = {};
   
    for (const moduleKey of moduleKeys) {
      const findingIds = new Set();
      pages.forEach((p) => {
        const mod = p.modules[moduleKey];
        if (mod) mod.findings.forEach((f) => findingIds.add(f.id));
      });
   
      const aggregatedFindings = [];
      for (const findingId of findingIds) {
        const perPage = pages
          .map((p) => {
            const mod = p.modules[moduleKey];
            const f = mod?.findings.find((x) => x.id === findingId);
            return f ? { url: p.url, finding: f } : null;
          })
          .filter(Boolean);
   
        if (perPage.length === 0) continue;
   
        const total = perPage.length;
        const criticalCount = perPage.filter((x) => x.finding.severity === 'critical').length;
        const warningCount = perPage.filter((x) => x.finding.severity === 'warning').length;
        const passedCount = total - criticalCount - warningCount;
   
        let severity = 'passed';
        if (criticalCount / total > 0.2) severity = 'critical';
        else if (criticalCount > 0 || warningCount > 0) severity = 'warning';
   
        const label = perPage[0].finding.label;
        const recommendation = perPage.find((x) => x.finding.recommendation)?.finding.recommendation || null;
   
        const issues = perPage
          .filter((x) => x.finding.severity !== 'passed')
          .map((x) => ({ url: x.url, severity: x.finding.severity, detail: x.finding.detail }));
   
        aggregatedFindings.push({
          id: findingId,
          label,
          severity,
          detail: `${passedCount} of ${total} page${total !== 1 ? 's' : ''} passing`
            + (criticalCount > 0 ? `, ${criticalCount} critical` : '')
            + (warningCount > 0 ? `, ${warningCount} warning${warningCount !== 1 ? 's' : ''}` : '')
            + '.',
          recommendation,
          issues,
        });
      }
   
      const label = pages.find((p) => p.modules[moduleKey])?.modules[moduleKey].label || moduleKey;
      aggregatedModules[moduleKey] = { label, findings: aggregatedFindings };
    }
   
    return aggregatedModules;
  }
   
  async function runSeoAuditCrawl(rootUrl, maxPages) {
    const pages = await crawlSeoAudit(rootUrl, maxPages);
    const aggregatedModules = aggregateSeoModules(pages);
    const { score, overallCapped, summary, moduleScores } = scoreModules(aggregatedModules);
   
    return {
      url: rootUrl,
      checkedAt: new Date().toISOString(),
      score,
      overallCapped,
      summary,
      moduleScores,
      modules: aggregatedModules,
      isCrawl: true,
      pagesCrawled: pages.length,
      pages: pages.map((p) => ({ url: p.url, modules: p.modules, score: p.score, summary: p.summary })),
    };
  }
   
   
  module.exports = {
    analyzeMetaTags, analyzeHeadings, analyzeImages, analyzeImageMetadata, analyzeUrl,
    analyzeCanonical, analyzeIndexability, runSeoAudit, runSeoAuditCrawl, finding,
  };
   