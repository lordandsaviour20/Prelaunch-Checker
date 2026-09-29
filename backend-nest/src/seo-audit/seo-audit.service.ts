import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import {
    AuditSummary,
    CanonicalResult,
    Finding,
    HeadingNode,
    ImageAnalysisResult,
    ImageDetail,
    ImageMetadataResult,
    ImageWithMetadata,
    IndexabilityInput,
    IndexabilityResult,
    ModuleResult,
    ModuleScore,
    RunSeoAuditOptions,
    ScoredModules,
    SeoAuditReport,
    Severity,
  } from './seo-audit.types';

const MAX_IMAGES_TO_CHECK = 30;
const IMAGE_CONCURRENCY = 5;

const MODULE_LABELS: Record<string, string> = {
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
  const MODULE_WEIGHTS: Record<string, number> = {
    indexability: 25,
    metaTags: 20,
    canonical: 15,
    headings: 15,
    images: 15,
    url: 10,
  };
  
  const SEVERITY_VALUE: Record<Severity, number> = { passed: 1, warning: 0.5, critical: 0 };

@Injectable()
export class SeoAuditService {
  finding(
    id: string,
    label: string,
    severity: Severity,
    detail: string,
    recommendation: string | null = null,
  ): Finding {
    return { id, label, severity, detail, recommendation };
  }

  // ---------- 1. Meta Tag Analyzer ----------

  analyzeMetaTags($: CheerioAPI, pageUrl: string): Finding[] {
    const findings: Finding[] = [];

    const title = $('title').first().text().trim();
    if (!title) {
      findings.push(
        this.finding(
          'title',
          'Title Tag',
          'critical',
          'No <title> tag found.',
          'Add a unique, descriptive title tag (ideally 50-60 characters).',
        ),
      );
    } else if (title.length < 30 || title.length > 65) {
      findings.push(
        this.finding(
          'title',
          'Title Tag',
          'warning',
          `Title is ${title.length} characters: "${title}"`,
          'Aim for roughly 50-60 characters so it displays fully in search results.',
        ),
      );
    } else {
      findings.push(
        this.finding('title', 'Title Tag', 'passed', `"${title}" (${title.length} characters)`),
      );
    }

    const description = $('meta[name="description"]').attr('content')?.trim() || '';
    if (!description) {
      findings.push(
        this.finding(
          'metaDescription',
          'Meta Description',
          'critical',
          'No meta description found.',
          'Add a meta description summarizing the page (roughly 150-160 characters).',
        ),
      );
    } else if (description.length < 120 || description.length > 165) {
      findings.push(
        this.finding(
          'metaDescription',
          'Meta Description',
          'warning',
          `Description is ${description.length} characters: "${description}"`,
          'Aim for roughly 150-160 characters.',
        ),
      );
    } else {
      findings.push(
        this.finding(
          'metaDescription',
          'Meta Description',
          'passed',
          `"${description}" (${description.length} characters)`,
        ),
      );
    }

    const canonicalCount = $('link[rel="canonical"]').length;
    if (canonicalCount === 0) {
      findings.push(
        this.finding(
          'canonicalPresence',
          'Canonical URL',
          'warning',
          'No canonical link tag found.',
          'Add a <link rel="canonical"> tag to avoid duplicate-content issues.',
        ),
      );
    } else if (canonicalCount > 1) {
      findings.push(
        this.finding(
          'canonicalPresence',
          'Canonical URL',
          'critical',
          `${canonicalCount} canonical tags found (should be exactly one).`,
          'Remove duplicate canonical tags — only one should be present.',
        ),
      );
    } else {
      findings.push(
        this.finding(
          'canonicalPresence',
          'Canonical URL',
          'passed',
          $('link[rel="canonical"]').attr('href') || '',
        ),
      );
    }

    const robotsMeta = $('meta[name="robots"]').attr('content') || '';
    if (robotsMeta && /noindex/i.test(robotsMeta)) {
      findings.push(
        this.finding(
          'robotsMeta',
          'Robots Meta Tag',
          'critical',
          `Robots meta tag says: "${robotsMeta}"`,
          'This page is set to noindex — remove this if the page should appear in search results.',
        ),
      );
    } else if (robotsMeta) {
      findings.push(this.finding('robotsMeta', 'Robots Meta Tag', 'passed', `"${robotsMeta}"`));
    } else {
      findings.push(
        this.finding(
          'robotsMeta',
          'Robots Meta Tag',
          'passed',
          'No robots meta tag (defaults to indexable).',
        ),
      );
    }

    const viewport = $('meta[name="viewport"]').attr('content') || '';
    if (!viewport) {
      findings.push(
        this.finding(
          'viewport',
          'Viewport Meta Tag',
          'critical',
          'No viewport meta tag found.',
          'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
        ),
      );
    } else if (!viewport.includes('width=device-width')) {
      findings.push(
        this.finding(
          'viewport',
          'Viewport Meta Tag',
          'warning',
          `Found: "${viewport}"`,
          'Include width=device-width for proper mobile scaling.',
        ),
      );
    } else {
      findings.push(this.finding('viewport', 'Viewport Meta Tag', 'passed', `"${viewport}"`));
    }

    const lang = $('html').attr('lang');
    if (!lang) {
      findings.push(
        this.finding(
          'langAttribute',
          'Language Attribute',
          'warning',
          'No lang attribute on <html>.',
          'Add a lang attribute (e.g. lang="en") to help search engines and screen readers.',
        ),
      );
    } else {
      findings.push(
        this.finding('langAttribute', 'Language Attribute', 'passed', `lang="${lang}"`),
      );
    }

    const ogTags = ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'];
    const missingOg = ogTags.filter((tag) => !$(`meta[property="${tag}"]`).attr('content'));
    if (missingOg.length === ogTags.length) {
      findings.push(
        this.finding(
          'openGraph',
          'Open Graph Tags',
          'warning',
          'No Open Graph tags found.',
          'Add og:title, og:description, og:image, og:url, and og:type for better social sharing previews.',
        ),
      );
    } else if (missingOg.length > 0) {
      findings.push(
        this.finding(
          'openGraph',
          'Open Graph Tags',
          'warning',
          `Missing: ${missingOg.join(', ')}`,
          'Add the missing Open Graph tags for a complete social preview.',
        ),
      );
    } else {
      findings.push(
        this.finding('openGraph', 'Open Graph Tags', 'passed', 'All core Open Graph tags present.'),
      );
    }

    const twitterCard = $('meta[name="twitter:card"]').attr('content');
    if (!twitterCard) {
      findings.push(
        this.finding(
          'twitterCard',
          'Twitter/X Card',
          'warning',
          'No twitter:card tag found.',
          'Add twitter:card, twitter:title, twitter:description, and twitter:image tags.',
        ),
      );
    } else {
      findings.push(
        this.finding('twitterCard', 'Twitter/X Card', 'passed', `twitter:card="${twitterCard}"`),
      );
    }

    return findings;
  }

  // ---------- 2. Heading Structure Analyzer ----------

  analyzeHeadings($: CheerioAPI): ModuleResult & { tree: HeadingNode[] } {
    const findings: Finding[] = [];

    const headingTree: HeadingNode[] = [];
    $('h1, h2, h3, h4, h5, h6').each((i, el) => {
      const tag = (el as { tagName: string }).tagName.toLowerCase();
      const level = parseInt(tag[1], 10);
      const text = $(el).text().trim();
      headingTree.push({ level, tag, text });
    });

    const h1s = headingTree.filter((h) => h.level === 1);
    if (h1s.length === 0) {
      findings.push(
        this.finding(
          'h1Exists',
          'H1 Tag',
          'critical',
          'No H1 tag found on the page.',
          "Add exactly one H1 tag describing the page's main topic.",
        ),
      );
    } else if (h1s.length > 1) {
      findings.push(
        this.finding(
          'h1Exists',
          'H1 Tag',
          'warning',
          `${h1s.length} H1 tags found: ${h1s.map((h) => `"${h.text}"`).join(', ')}`,
          'Use a single H1 per page for the clearest content hierarchy.',
        ),
      );
    } else {
      findings.push(this.finding('h1Exists', 'H1 Tag', 'passed', `"${h1s[0].text}"`));
    }

    const emptyHeadings = headingTree.filter((h) => !h.text);
    if (emptyHeadings.length > 0) {
      findings.push(
        this.finding(
          'emptyHeadings',
          'Empty Headings',
          'warning',
          `${emptyHeadings.length} empty heading tag(s) found.`,
          'Remove empty heading tags or add meaningful text to them.',
        ),
      );
    } else {
      findings.push(
        this.finding('emptyHeadings', 'Empty Headings', 'passed', 'No empty headings found.'),
      );
    }

    const longHeadings = headingTree.filter((h) => h.text.length > 70);
    if (longHeadings.length > 0) {
      findings.push(
        this.finding(
          'longHeadings',
          'Excessively Long Headings',
          'warning',
          `${longHeadings.length} heading(s) over 70 characters.`,
          'Keep headings concise — long headings can hurt readability and hierarchy clarity.',
        ),
      );
    } else {
      findings.push(
        this.finding(
          'longHeadings',
          'Excessively Long Headings',
          'passed',
          'All headings are a reasonable length.',
        ),
      );
    }

    const skippedLevels: string[] = [];
    let previousLevel = 0;
    for (const h of headingTree) {
      if (previousLevel > 0 && h.level > previousLevel + 1) {
        skippedLevels.push(`H${previousLevel} → H${h.level} ("${h.text}")`);
      }
      previousLevel = h.level;
    }
    if (skippedLevels.length > 0) {
      findings.push(
        this.finding(
          'skippedLevels',
          'Heading Hierarchy',
          'warning',
          `Skipped level(s): ${skippedLevels.join('; ')}`,
          'Avoid skipping heading levels (e.g. H1 straight to H3) — it can confuse content structure and accessibility tools. This is a warning, not a fatal error.',
        ),
      );
    } else if (headingTree.length > 0) {
      findings.push(
        this.finding(
          'skippedLevels',
          'Heading Hierarchy',
          'passed',
          'No skipped heading levels detected.',
        ),
      );
    }

    return { findings, tree: headingTree };
  }
    // ---------- 3. Image SEO Analyzer ----------

    private filenameFromUrl(url: string): string {
        try {
          const parsed = new URL(url);
          const parts = parsed.pathname.split('/').filter(Boolean);
          return parts[parts.length - 1] || url;
        } catch {
          const parts = url.split('/').filter(Boolean);
          return parts[parts.length - 1] || url;
        }
      }
    
      // Flags generic camera/CMS-generated filenames: IMG_2398.jpg, DSC0001.png, image1.jpg, photo (2).jpg
      private isPoorFilename(filename: string): boolean {
        return /^(img|dsc|image|photo|screenshot|untitled)[-_ ]?\(?\d*\)?\.[a-z]+$/i.test(
          filename.trim(),
        );
      }
    
      private extractImageDetails($: CheerioAPI, baseUrl: string): ImageDetail[] {
        const images: ImageDetail[] = [];
        $('img').each((i, el) => {
          const $el = $(el);
          const src = $el.attr('src') || $el.attr('data-src') || '';
          if (!src) return;
          let absoluteUrl: string;
          try {
            absoluteUrl = new URL(src, baseUrl).toString();
          } catch {
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
      analyzeImages($: CheerioAPI, pageUrl: string): ImageAnalysisResult {
        const findings: Finding[] = [];
        const images = this.extractImageDetails($, pageUrl);
        const total = images.length;
    
        if (total === 0) {
          findings.push(
            this.finding('imagesPresent', 'Images Found', 'passed', 'No images found on this page.'),
          );
          return { findings, images: [] };
        }
    
        const missingAlt = images.filter((img) => img.alt === undefined || img.alt === null);
        const emptyAlt = images.filter(
          (img) => img.alt !== undefined && img.alt !== null && img.alt.trim() === '',
        );
        const longAlt = images.filter((img) => img.alt && img.alt.length > 125);
        const missingDimensions = images.filter((img) => !img.width || !img.height);
        const noLazyLoad = images.filter((img, idx) => idx > 2 && img.loading !== 'lazy'); // first few assumed above-the-fold
        const poorFilenames = images.filter((img) =>
          this.isPoorFilename(this.filenameFromUrl(img.src)),
        );
    
        findings.push(
          missingAlt.length > 0
            ? this.finding(
                'missingAlt',
                'Missing ALT Attributes',
                'critical',
                `${missingAlt.length} of ${total} images have no alt attribute at all.`,
                'Add descriptive alt text to every meaningful image.',
              )
            : this.finding('missingAlt', 'Missing ALT Attributes', 'passed', 'All images have an alt attribute.'),
        );
    
        findings.push(
          emptyAlt.length > 0
            ? this.finding(
                'emptyAlt',
                'Empty ALT Text',
                'warning',
                `${emptyAlt.length} image(s) have alt="" (fine only for purely decorative images).`,
                'Confirm these images are decorative; otherwise add descriptive alt text.',
              )
            : this.finding('emptyAlt', 'Empty ALT Text', 'passed', 'No empty alt attributes found.'),
        );
    
        findings.push(
          longAlt.length > 0
            ? this.finding(
                'longAlt',
                'Excessively Long ALT Text',
                'warning',
                `${longAlt.length} image(s) have alt text over 125 characters.`,
                'Keep alt text concise and descriptive - aim under ~125 characters.',
              )
            : this.finding('longAlt', 'Excessively Long ALT Text', 'passed', 'Alt text lengths look reasonable.'),
        );
    
        findings.push(
          missingDimensions.length > 0
            ? this.finding(
                'missingDimensions',
                'Width/Height Attributes',
                'warning',
                `${missingDimensions.length} of ${total} images are missing width/height attributes.`,
                'Add explicit width and height attributes to prevent layout shift (CLS) while images load.',
              )
            : this.finding(
                'missingDimensions',
                'Width/Height Attributes',
                'passed',
                'All images specify width and height.',
              ),
        );
    
        findings.push(
          noLazyLoad.length > 0
            ? this.finding(
                'lazyLoading',
                'Lazy Loading',
                'warning',
                `${noLazyLoad.length} below-the-fold image(s) are not using loading="lazy".`,
                'Add loading="lazy" to images that are not immediately visible on page load.',
              )
            : this.finding('lazyLoading', 'Lazy Loading', 'passed', 'Lazy loading looks appropriately applied.'),
        );
    
        findings.push(
          poorFilenames.length > 0
            ? this.finding(
                'filenameQuality',
                'Filename Quality',
                'warning',
                `${poorFilenames.length} image(s) use generic filenames (e.g. "${this.filenameFromUrl(poorFilenames[0].src)}").`,
                'Rename image files descriptively - e.g. "blue-sapphire-ring.jpg" instead of "IMG_2398.jpg".',
              )
            : this.finding('filenameQuality', 'Filename Quality', 'passed', 'Image filenames look descriptive.'),
        );
    
        return { findings, images };
      }
    
      // Async part - file size + format, requires a HEAD request per image.
      // Capped and concurrency-limited so a page with hundreds of images can't
      // turn this into an uncontrolled crawl of someone's image CDN.
      async analyzeImageMetadata(images: ImageDetail[]): Promise<ImageMetadataResult> {
        const capped = images.slice(0, MAX_IMAGES_TO_CHECK);
        const findings: Finding[] = [];
    
        if (capped.length === 0) {
          return { findings, imagesWithMetadata: [] };
        }
    
        const results = await this.runWithConcurrencyLimit<ImageDetail, ImageWithMetadata>(
          capped,
          IMAGE_CONCURRENCY,
          async (img) => {
            try {
              const response = await axios.head(img.src, {
                timeout: 8000,
                validateStatus: () => true,
              });
              const sizeBytes = parseInt(String(response.headers['content-length']), 10) || null;
              const contentType = (response.headers['content-type'] as string) || null;
              return { ...img, sizeBytes, contentType, statusCode: response.status };
            } catch (err) {
              return {
                ...img,
                sizeBytes: null,
                contentType: null,
                error: err instanceof Error ? err.message : String(err),
              };
            }
          },
        );
    
        const oversized = results.filter((img) => img.sizeBytes && img.sizeBytes > 300 * 1024); // > 300KB
        const modernFormats = ['image/webp', 'image/avif'];
        const legacyFormat = results.filter(
          (img) =>
            img.contentType &&
            !modernFormats.includes(img.contentType) &&
            /image\/(jpeg|png)/i.test(img.contentType),
        );
    
        findings.push(
          oversized.length > 0
            ? this.finding(
                'imageFileSize',
                'Image File Size',
                'warning',
                `${oversized.length} image(s) are over 300KB.`,
                'Compress large images or serve responsively-sized versions.',
              )
            : this.finding('imageFileSize', 'Image File Size', 'passed', 'No excessively large images detected.'),
        );
    
        findings.push(
          legacyFormat.length > 0
            ? this.finding(
                'imageFormat',
                'Image Format',
                'warning',
                `${legacyFormat.length} image(s) use JPEG/PNG instead of a modern format.`,
                'Consider serving images as WebP or AVIF for smaller file sizes.',
              )
            : this.finding('imageFormat', 'Image Format', 'passed', 'Images use modern or appropriately chosen formats.'),
        );
    
        return { findings, imagesWithMetadata: results };
      }
    
      // Small local concurrency-limited runner (mirrors the one in ChecksService,
      // kept local here so SeoAuditService doesn't depend on ChecksService).
      private async runWithConcurrencyLimit<T, R>(
        items: T[],
        limit: number,
        worker: (item: T) => Promise<R>,
      ): Promise<R[]> {
        const results: R[] = [];
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

        // ---------- 4. URL SEO Analyzer ----------

  analyzeUrl(pageUrl: string): Finding[] {
    const findings: Finding[] = [];
    const parsed = new URL(pageUrl);

    findings.push(
      parsed.protocol === 'https:'
        ? this.finding('urlHttps', 'HTTPS', 'passed', 'URL uses HTTPS.')
        : this.finding(
            'urlHttps',
            'HTTPS',
            'critical',
            `URL uses ${parsed.protocol.replace(':', '')} instead of HTTPS.`,
            'Serve the page over HTTPS.',
          ),
    );

    findings.push(
      pageUrl.length > 100
        ? this.finding(
            'urlLength',
            'URL Length',
            'warning',
            `URL is ${pageUrl.length} characters.`,
            'Shorten the URL where possible - aim under roughly 75-100 characters.',
          )
        : this.finding('urlLength', 'URL Length', 'passed', `URL is ${pageUrl.length} characters.`),
    );

    findings.push(
      /[A-Z]/.test(parsed.pathname)
        ? this.finding(
            'urlUppercase',
            'Uppercase Characters',
            'warning',
            'URL path contains uppercase characters.',
            'Use lowercase-only URLs to avoid duplicate-content issues from case-sensitive servers.',
          )
        : this.finding('urlUppercase', 'Uppercase Characters', 'passed', 'URL path is lowercase.'),
    );

    findings.push(
      /\s|%20/.test(pageUrl)
        ? this.finding(
            'urlSpaces',
            'Spaces in URL',
            'critical',
            'URL contains spaces (or encoded spaces).',
            'Remove spaces from the URL path.',
          )
        : this.finding('urlSpaces', 'Spaces in URL', 'passed', 'No spaces found in URL.'),
    );

    findings.push(
      /[^a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]/.test(pageUrl)
        ? this.finding(
            'urlSpecialChars',
            'Special Characters',
            'warning',
            'URL contains unusual special characters.',
            'Stick to letters, numbers, and hyphens in URL paths.',
          )
        : this.finding('urlSpecialChars', 'Special Characters', 'passed', 'No unusual special characters found.'),
    );

    const paramCount = Array.from(parsed.searchParams.keys()).length;
    findings.push(
      paramCount > 3
        ? this.finding(
            'urlQueryParams',
            'Query Parameters',
            'warning',
            `URL has ${paramCount} query parameters.`,
            'Excessive query parameters can create duplicate-content and crawl-budget issues - consider clean paths instead.',
          )
        : this.finding('urlQueryParams', 'Query Parameters', 'passed', `URL has ${paramCount} query parameter(s).`),
    );

    findings.push(
      /_/.test(parsed.pathname)
        ? this.finding(
            'urlUnderscores',
            'Underscores vs Hyphens',
            'warning',
            'URL path uses underscores.',
            'Use hyphens instead of underscores as word separators - search engines treat hyphens as word breaks.',
          )
        : this.finding('urlUnderscores', 'Underscores vs Hyphens', 'passed', 'No underscores found in URL path.'),
    );

    // Trailing-slash and readability are single-URL observations, not
    // pass/fail judgments - true "consistency" needs multiple URLs to assess,
    // which is out of scope for a single-page check.
    const hasTrailingSlash = parsed.pathname.length > 1 && parsed.pathname.endsWith('/');
    findings.push(
      this.finding(
        'urlTrailingSlash',
        'Trailing Slash',
        'passed',
        hasTrailingSlash
          ? 'URL path ends with a trailing slash.'
          : 'URL path has no trailing slash.',
        'Ensure this is applied consistently site-wide (either always or never) to avoid duplicate-content issues.',
      ),
    );

    const segments = parsed.pathname.split('/').filter(Boolean);
    const looksLikeId = segments.some((seg) => /^[0-9a-f]{8,}$/i.test(seg) || /^\d+$/.test(seg));
    findings.push(
      looksLikeId
        ? this.finding(
            'urlReadability',
            'Readability',
            'warning',
            'URL path contains numeric IDs or hash-like segments.',
            'Consider using descriptive slugs (e.g. /products/blue-sapphire-ring) instead of raw IDs where possible.',
          )
        : this.finding('urlReadability', 'Readability', 'passed', 'URL path looks reasonably descriptive.'),
    );

    return findings;
  }

  // ---------- 5. Canonical URL Checker ----------

  async analyzeCanonical($: CheerioAPI, pageUrl: string): Promise<CanonicalResult> {
    const findings: Finding[] = [];
    const canonicalTags = $('link[rel="canonical"]');
    const count = canonicalTags.length;

    if (count === 0) {
      findings.push(
        this.finding(
          'canonicalExists',
          'Canonical Tag Exists',
          'warning',
          'No canonical link tag found.',
          'Add a <link rel="canonical"> tag to avoid duplicate-content issues.',
        ),
      );
      return { findings, canonicalUrl: null, isSelfReferencing: null };
    }

    if (count > 1) {
      findings.push(
        this.finding(
          'canonicalExists',
          'Canonical Tag Exists',
          'critical',
          `${count} canonical tags found (should be exactly one).`,
          'Remove duplicate canonical tags - only one should be present.',
        ),
      );
      // Still evaluate the first one found, since that's what browsers/crawlers will typically honor
    } else {
      findings.push(
        this.finding('canonicalExists', 'Canonical Tag Exists', 'passed', 'Exactly one canonical tag found.'),
      );
    }

    const rawHref = canonicalTags.first().attr('href') || '';
    let canonicalUrl: string;
    try {
      canonicalUrl = new URL(rawHref, pageUrl).toString();
    } catch {
      findings.push(
        this.finding(
          'canonicalAbsolute',
          'Absolute URL',
          'critical',
          `Canonical href "${rawHref}" is not a valid URL.`,
          'Use a full, valid absolute URL in the canonical tag.',
        ),
      );
      return { findings, canonicalUrl: null, isSelfReferencing: null };
    }

    findings.push(
      /^https?:\/\//i.test(rawHref)
        ? this.finding('canonicalAbsolute', 'Absolute URL', 'passed', 'Canonical URL is absolute.')
        : this.finding(
            'canonicalAbsolute',
            'Absolute URL',
            'warning',
            `Canonical href "${rawHref}" is relative.`,
            'Use an absolute URL (including https://) in the canonical tag - relative canonicals are handled inconsistently by crawlers.',
          ),
    );

    const canonicalParsed = new URL(canonicalUrl);
    findings.push(
      canonicalParsed.protocol === 'https:'
        ? this.finding('canonicalHttps', 'Canonical Uses HTTPS', 'passed', 'Canonical URL uses HTTPS.')
        : this.finding(
            'canonicalHttps',
            'Canonical Uses HTTPS',
            'warning',
            'Canonical URL does not use HTTPS.',
            'Point the canonical tag at the HTTPS version of the URL.',
          ),
    );

    const normalize = (u: string) => u.replace(/\/$/, '').toLowerCase();
    const isSelfReferencing = normalize(canonicalUrl) === normalize(pageUrl);
    findings.push(
      isSelfReferencing
        ? this.finding(
            'canonicalSelfRef',
            'Self-Referencing',
            'passed',
            'Canonical URL matches this page (self-referencing).',
          )
        : this.finding(
            'canonicalSelfRef',
            'Self-Referencing',
            'warning',
            `Canonical points to a different URL: ${canonicalUrl}`,
            'Confirm this is intentional - if this page is not a duplicate of another, its canonical should point to itself.',
          ),
    );

    // Check the canonical target is actually reachable (not itself broken/redirecting into an error)
    try {
      const response = await axios.get(canonicalUrl, {
        timeout: 8000,
        maxRedirects: 5,
        validateStatus: () => true,
      });
      if (response.status >= 400) {
        findings.push(
          this.finding(
            'canonicalTargetStatus',
            'Canonical Target Availability',
            'critical',
            `Canonical target returned status ${response.status}.`,
            'Fix the canonical target so it resolves successfully - a broken canonical target undermines the tag entirely.',
          ),
        );
      } else if (response.status >= 300) {
        findings.push(
          this.finding(
            'canonicalTargetStatus',
            'Canonical Target Availability',
            'warning',
            `Canonical target redirects (status ${response.status}).`,
            'Point the canonical directly at the final URL rather than one that redirects.',
          ),
        );
      } else {
        findings.push(
          this.finding(
            'canonicalTargetStatus',
            'Canonical Target Availability',
            'passed',
            'Canonical target is reachable and returns a success status.',
          ),
        );
      }
    } catch (err) {
      findings.push(
        this.finding(
          'canonicalTargetStatus',
          'Canonical Target Availability',
          'critical',
          `Could not reach canonical target: ${err instanceof Error ? err.message : String(err)}`,
          'Ensure the canonical URL is reachable.',
        ),
      );
    }

    return { findings, canonicalUrl, isSelfReferencing };
  }

  // ---------- Indexability Checker ----------
  // Takes already-computed signals from other analyzers rather than re-deriving
  // them, so this verdict can never quietly disagree with the canonical/meta
  // findings sitting right next to it in the report.

  async analyzeIndexability(input: IndexabilityInput): Promise<IndexabilityResult> {
    const { pageUrl, statusCode, robotsMetaContent, xRobotsTagHeader, canonicalUrl, isSelfReferencing } = input;
    const reasons: string[] = [];
    let verdict: IndexabilityResult['verdict'] = 'Indexable';

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

    try {
      const robotsUrl = new URL('/robots.txt', pageUrl).toString();
      const response = await axios.get(robotsUrl, { timeout: 8000, validateStatus: () => true });
      if (response.status === 200) {
        const content = (response.data || '').toString();
        const disallowsAll = /User-agent:\s*\*\s*\n\s*Disallow:\s*\/\s*$/im.test(content);
        if (disallowsAll) {
          verdict = 'Not indexable';
          reasons.push('robots.txt disallows all crawling for this path.');
        }
      }
    } catch {
      reasons.push('Could not verify robots.txt (request failed) - crawl restrictions are uncertain.');
      if (verdict === 'Indexable') verdict = 'Uncertain';
    }

    if (canonicalUrl && isSelfReferencing === false) {
      reasons.push(
        `Canonical points to a different URL (${canonicalUrl}) - search engines may index that URL instead of this one.`,
      );
      if (verdict === 'Indexable') verdict = 'Uncertain';
    }

    if (reasons.length === 0) {
      reasons.push(
        'No indexing restrictions detected in robots.txt, robots meta tag, X-Robots-Tag header, canonical, or HTTP status.',
      );
    }

    const severity: Severity = verdict === 'Indexable' ? 'passed' : verdict === 'Uncertain' ? 'warning' : 'critical';

    const findings: Finding[] = [
      this.finding(
        'indexability',
        'Indexability',
        severity,
        `${verdict}. ${reasons.join(' ')}`,
        verdict !== 'Indexable' ? 'Review the listed signal(s) if you want this page to appear in search results.' : null,
      ),
    ];

    return { findings, verdict, reasons };
  }
    // ---------- Scoring & report assembly ----------

  // A module's own sub-score (0-100), from only its own findings - this is
  // what stops a finding-heavy module (Meta Tags: 8 findings) from drowning
  // out a finding-light one (Indexability: 1 finding) before weighting.
  private computeModuleSubScore(findings: Finding[]): number | null {
    if (!findings || findings.length === 0) return null;
    let earned = 0;
    for (const f of findings) {
      earned += SEVERITY_VALUE[f.severity] ?? 0;
    }
    return Math.round((earned / findings.length) * 100);
  }

  // Shared by both buildAuditReport (single page) and runSeoAuditCrawl
  // (aggregated), so the two scoring paths can never silently diverge.
  scoreModules(moduleSummaries: Record<string, ModuleResult>): ScoredModules {
    let critical = 0;
    let warning = 0;
    let passed = 0;
    const moduleScores: ModuleScore[] = [];

    for (const [key, mod] of Object.entries(moduleSummaries)) {
      const findings = mod.findings || [];
      for (const f of findings) {
        if (f.severity === 'critical') critical++;
        else if (f.severity === 'warning') warning++;
        else passed++;
      }

      const subScore = this.computeModuleSubScore(findings);
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
    let score =
      totalWeight === 0
        ? 0
        : Math.round(moduleScores.reduce((sum, m) => sum + m.score * m.weight, 0) / totalWeight);

    // Hard cap: any critical Indexability finding caps the overall score,
    // regardless of how well everything else scores - a page that can't be
    // indexed shouldn't be able to "average its way" to a good grade.
    let overallCapped = false;
    const indexabilityCritical = moduleSummaries.indexability?.findings?.some(
      (f) => f.severity === 'critical',
    );
    if (indexabilityCritical && score > 40) {
      score = 40;
      overallCapped = true;
    }

    const total = critical + warning + passed;
    const summary: AuditSummary = { critical, warning, passed, total };
    return { score, overallCapped, summary, moduleScores };
  }

  private buildAuditReport(pageUrl: string, modules: Record<string, ModuleResult>): SeoAuditReport {
    const { score, overallCapped, summary, moduleScores } = this.scoreModules(modules);
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

  isInternalLink(linkUrl: string, rootHostname: string): boolean {
    try {
      const parsed = new URL(linkUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
      return parsed.hostname === rootHostname || parsed.hostname.endsWith('.' + rootHostname);
    } catch {
      return false;
    }
  }

  extractInternalLinksFromHtml($: CheerioAPI, baseUrl: string, rootHostname: string): string[] {
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
        // Malformed href, skip it
      }
    });
    return Array.from(hrefs);
  }

  async runSeoAudit(pageUrl: string, options: RunSeoAuditOptions = {}): Promise<SeoAuditReport> {
    const { rootHostname } = options;

    let response;
    try {
      response = await axios.get(pageUrl, {
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: () => true,
      });
    } catch (err) {
      const modules: Record<string, ModuleResult> = {
        indexability: {
          findings: [
            this.finding(
              'pageAccessible',
              'Page Accessible',
              'critical',
              `Could not load this page: ${err instanceof Error ? err.message : String(err)}`,
              'Check that the site is reachable and serves a complete, valid SSL certificate chain (including intermediate certificates).',
            ),
          ],
        },
      };
      const report = this.buildAuditReport(pageUrl, modules);
      return rootHostname ? { ...report, internalLinks: [] } : report;
    }

    const statusCode = response.status;
    const html = typeof response.data === 'string' ? response.data : '';
    const xRobotsTagHeader = (response.headers['x-robots-tag'] as string) || null;

    const modules: Record<string, ModuleResult> = {};

    if (!html) {
      modules.indexability = await this.analyzeIndexability({
        pageUrl,
        statusCode,
        robotsMetaContent: null,
        xRobotsTagHeader,
        canonicalUrl: null,
        isSelfReferencing: null,
      });
      const report = this.buildAuditReport(pageUrl, modules);
      return rootHostname ? { ...report, internalLinks: [] } : report;
    }

    const $ = cheerio.load(html);

    modules.metaTags = { findings: this.analyzeMetaTags($, pageUrl) };
    modules.headings = this.analyzeHeadings($);

    const imageBase = this.analyzeImages($, pageUrl);
    const imageMeta = await this.analyzeImageMetadata(imageBase.images);
    modules.images = { findings: [...imageBase.findings, ...imageMeta.findings] };

    modules.url = { findings: this.analyzeUrl(pageUrl) };

    const canonicalResult = await this.analyzeCanonical($, pageUrl);
    modules.canonical = canonicalResult;

    const robotsMetaContent = $('meta[name="robots"]').attr('content') || null;
    modules.indexability = await this.analyzeIndexability({
      $,
      pageUrl,
      statusCode,
      robotsMetaContent,
      xRobotsTagHeader,
      canonicalUrl: canonicalResult.canonicalUrl,
      isSelfReferencing: canonicalResult.isSelfReferencing,
    });

    const report = this.buildAuditReport(pageUrl, modules);

    // Only extract links in crawl mode - a single-page audit has no use for them,
    // and this reuses the $ already loaded above rather than re-fetching.
    if (rootHostname) {
      const internalLinks = this.extractInternalLinksFromHtml($, pageUrl, rootHostname);
      return { ...report, internalLinks };
    }

    return report;
  }
}