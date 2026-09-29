import { Injectable } from '@nestjs/common';
import axios from 'axios';
import type { CheerioAPI } from 'cheerio';
import {
  Finding,
  HeadingNode,
  ImageAnalysisResult,
  ImageDetail,
  ImageMetadataResult,
  ImageWithMetadata,
  ModuleResult,
  Severity,
} from './seo-audit.types';

const MAX_IMAGES_TO_CHECK = 30;
const IMAGE_CONCURRENCY = 5;

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
}