import { Injectable } from '@nestjs/common';
import type { CheerioAPI } from 'cheerio';
import { Finding, HeadingNode, ModuleResult, Severity } from './seo-audit.types';

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
}