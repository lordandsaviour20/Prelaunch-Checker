# Prelaunch Checker

**A comprehensive pre-launch website auditing tool** — scan any URL for accessibility, SEO, security, and AI-visibility issues before it goes live, and get back a scored, actionable report.

## What it does

Prelaunch Checker runs a full audit of a website and returns a weighted score (0–100, letter-graded S/A/B/C/F) across every check, with plain-English fix suggestions for anything that fails.

### Core checks
- Accessibility (uptime, response time)
- SSL certificate validity
- Meta tags (title, description, viewport)
- Robots.txt and sitemap presence
- Broken link detection
- Image alt-text coverage

### Dedicated deep SEO Audit mode
A separate, in-depth SEO scan (distinct from the core checks above) that goes beyond surface-level checks:
- **Meta tags** — title, meta description, canonical URL, robots meta tag, viewport, language attribute, Open Graph, Twitter/X card
- **Heading structure** — H1 presence, empty headings, excessively long headings, heading hierarchy validation
- **Image SEO** — missing/empty/overlong alt text, width/height attributes, lazy loading, filename quality, file size, format
- **URL structure** — HTTPS, length, casing, spaces, special characters, query parameters, hyphens vs. underscores, trailing slashes, readability
- **Canonical URL** — tag existence, absolute URL, HTTPS usage, self-referencing, canonical target availability
- **Indexability** — full indexability analysis

Supports multi-page crawling, its own weighted 0–100 score, and its own history/report type alongside the core checks.

### AI Visibility checks
- Robots.txt rules for AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, etc.)
- Structured data (JSON-LD/Schema.org) presence
- `llms.txt` detection
- Semantic HTML scoring
- Raw-HTML text ratio (JS-rendering dependence test — flags pages AI fetchers may see as empty)
- Spoofed AI-user-agent requests to detect WAF/anti-bot blocking

### Multi-page crawling
- BFS crawl up to a configurable page limit/depth, aggregating results into one site-wide score with a per-page breakdown and per-check issue lists

### Reports & history
- PDF export (server-rendered via Puppeteer) with full per-page breakdowns, grading explanation, and fix suggestions
- Scan history with a filterable sidebar (standard scans vs. SEO audits)
- Scheduled re-checks (daily/weekly) with email + in-app alerts when a previously-passing check starts failing

### Accounts & security
- JWT-based auth — full functionality available anonymously, with history/PDF/scheduling gated behind login
- SSRF protection (blocks private/loopback/link-local IPs and cloud metadata endpoints, verified via DNS resolution, not just hostname string matching)
- Rate limiting (per-user for logged-in users, per-IP for anonymous)

## Tech stack

- **Frontend:** React
- **Backend:** Node.js, Express
- **Database:** MySQL
- **Job queue:** BullMQ + Redis
- **Crawling / PDF generation:** Puppeteer
- **Auth:** JWT
- **Email alerts:** Resend

## Status

Actively developed — core scanning, SEO audit, multi-page crawling, scheduled alerts, and security hardening are complete. In progress: a Clarity-style behavior analytics module (heatmaps, session replay, click/scroll tracking) as the next major feature.

## Versioning & Roadmap

This repository represents **v1** of Prelaunch Checker — the initial working build on React, Express, MySQL, and BullMQ/Redis, developed feature-by-feature through Phase 1–3 (core checks, SEO audit, multi-page crawling, user accounts, scheduled alerts, security hardening).

Future versions are planned to expand well beyond the current scope — adding a full behavior-analytics suite (heatmaps, session recordings, funnels), performance/Core Web Vitals monitoring, and keyword/backlink intelligence — and will involve a **stack migration** as the project scales:

- **Backend:** Express → NestJS (TypeScript), with a dedicated high-throughput ingestion service for analytics events
- **Database:** MySQL → PostgreSQL for relational data, plus ClickHouse for analytics/event data
- **Crawler:** Puppeteer → Playwright
- **Session replay:** rrweb-based recording pipeline
- **Infrastructure:** AWS (Fargate, RDS, ElastiCache, S3)

v1 will remain the baseline/reference implementation; later versions will be tracked as separate milestones/branches as the migration progresses.
