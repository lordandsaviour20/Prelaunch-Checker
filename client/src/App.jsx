import { useState, useRef, useEffect } from 'react';
import './App.css';
import ScanStage from './components/ScanStage';
import ScoreReveal from './components/ScoreReveal';
import ReportSkeleton from './components/ReportSkeleton';
import NotFoundBanner from './components/NotFoundBanner';
import { useTilt } from './hooks/useMotion';
import { createPortal } from 'react-dom';
import SeoAuditReport from './components/SeoAuditReport';


const CHECK_META = {
  accessible: { label: 'Website Accessible', group: 'Core' },
  ssl: { label: 'SSL Certificate', group: 'Core' },
  title: { label: 'Page Title', group: 'SEO' },
  metaDescription: { label: 'Meta Description', group: 'SEO' },
  sitemap: { label: 'Sitemap Available', group: 'SEO' },
  robotsTxt: { label: 'Robots.txt Available', group: 'SEO' },
  viewport: { label: 'Mobile Viewport', group: 'Accessibility' },
  imagesAlt: { label: 'Images Missing Alt Text', group: 'Accessibility' },
  brokenLinks: { label: 'Broken Links', group: 'Reliability' },
  aiCrawlerAccess: { label: 'AI Crawler Access', group: 'AI Visibility' },
  antiBotAccess: { label: 'Anti-Bot / Header Check', group: 'AI Visibility' },
  structuredData: { label: 'Structured Data (JSON-LD)', group: 'AI Visibility' },
  llmsTxt: { label: 'llms.txt', group: 'AI Visibility' },
  semanticHtml: { label: 'Semantic HTML', group: 'AI Visibility' },
  jsDependence: { label: 'JS Dependence', group: 'AI Visibility' },
};

const SEO_MODULE_META = {
  'Meta Tags': ['Title Tag', 'Meta Description', 'Canonical URL', 'Robots Meta Tag', 'Viewport Meta Tag', 'Language Attribute', 'Open Graph Tags', 'Twitter/X Card'],
  'Heading Structure': ['H1 Tag', 'Empty Headings', 'Excessively Long Headings', 'Heading Hierarchy'],
  'Images': ['Missing ALT Attributes', 'Empty ALT Text', 'Excessively Long ALT Text', 'Width/Height Attributes', 'Lazy Loading', 'Filename Quality', 'Image File Size', 'Image Format'],
  'URL Structure': ['HTTPS', 'URL Length', 'Uppercase Characters', 'Spaces in URL', 'Special Characters', 'Query Parameters', 'Underscores vs Hyphens', 'Trailing Slash', 'Readability'],
  'Canonical URL': ['Canonical Tag Exists', 'Absolute URL', 'Canonical Uses HTTPS', 'Self-Referencing', 'Canonical Target Availability'],
  'Indexability': ['Indexability'],
};

const GROUP_ORDER = ['Core', 'SEO', 'Accessibility', 'Reliability', 'AI Visibility'];
const STATUS_LABEL = { pass: 'Passed', warning: 'Warning', fail: 'Failed' };
const GRADE_COLORS = { S: '#a855f7', A: '#16a34a', B: '#0284c7', C: '#b45309', F: '#dc2626' };
const POLL_INTERVAL_MS = 2000;
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
    fail: "The SSL certificate is missing, expired, or untrusted. Install a valid certificate from a trusted certificate authority (e.g. via Let's Encrypt) and ensure HTTPS is properly configured.",
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

function fixSuggestionFor(key, status) {
  if (status !== 'warning' && status !== 'fail') return null;
  return FIX_SUGGESTIONS[key]?.[status] || null;
}

/* ---------------------------------------------------------------- icons -- */

const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
};

function SearchIcon() {
  return (
    <svg width="18" height="18" {...svgProps}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" {...svgProps}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" {...svgProps}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="18" {...svgProps}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" {...svgProps}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg {...svgProps} strokeWidth={2.4}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg width="15" height="15" {...svgProps}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="18" height="18" {...svgProps}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

function StatusGlyph({ status }) {
  if (status === 'pass') {
    return (
      <svg {...svgProps} strokeWidth={3} width="13" height="13">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (status === 'warning') {
    return (
      <svg {...svgProps} strokeWidth={3} width="13" height="13">
        <line x1="12" y1="7" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    );
  }
  return (
    <svg {...svgProps} strokeWidth={3} width="13" height="13">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/* ----------------------------------------------------------- components -- */

function StatusBadge({ status }) {
  return (
    <span className={`status-badge status-${status}`}>
      <StatusGlyph status={status} />
      {/* Status is never conveyed by colour alone. */}
      <span className="sr-only">{STATUS_LABEL[status] || 'Unknown'}</span>
    </span>
  );
}

function GradeBadge({ grade }) {
  if (!grade) return null;
  return (
    <span className="grade-badge" style={{ background: GRADE_COLORS[grade] || '#475569' }}>
      {grade}
      <span className="sr-only"> grade</span>
    </span>
  );
}

function CheckDetails({ checkKey, data, isCrawl }) {
  if (isCrawl && data.total !== undefined && data.failing !== undefined) {
    const fix = fixSuggestionFor(checkKey, data.status);
    return (
      <div>
        <p>
          {data.passing} of {data.total} page{data.total !== 1 ? 's' : ''} passing
          {data.failing > 0 && `, ${data.failing} failing`}
          {data.warning > 0 && `, ${data.warning} with warnings`}.
        </p>
        {fix && <p className="fix-note"><strong>Suggested fix:</strong> {fix}</p>}
        {data.issues && data.issues.length > 0 && (
          <ul className="aggregate-issue-list">
            {data.issues.map((issue) => (
              <li key={issue.url} className="aggregate-issue-item">
                <StatusBadge status={issue.status} />
                <span className="aggregate-issue-url break-text">{issue.url}</span>
                <span className="aggregate-issue-detail break-text"> — {issue.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (checkKey === 'accessible') {
    return (
      <p>
        Status code {data.statusCode ?? 'N/A'}, responded in {data.responseTimeMs}ms.
        {data.error && ` Error: ${data.error}`}
      </p>
    );
  }
  if (checkKey === 'ssl') {
    return (
      <p>
        {data.issuer && `Issued by ${data.issuer}. `}
        {data.validTo && `Valid until ${data.validTo}. `}
        {data.reason && data.reason}
      </p>
    );
  }
  if (checkKey === 'title' || checkKey === 'metaDescription') {
    return <p className="break-text">{data.value ? `"${data.value}" (${data.length} characters)` : 'Not found on the page.'}</p>;
  }
  if (checkKey === 'viewport') {
    return <p className="break-text">{data.value ? `Found: ${data.value}` : 'No viewport meta tag found.'}</p>;
  }
  if (checkKey === 'imagesAlt') {
    return <p>{data.missingAlt} of {data.total} images are missing alt text.</p>;
  }
  if (checkKey === 'sitemap' || checkKey === 'robotsTxt') {
    return <p className="break-text">{data.url || data.reason || 'No further details.'}</p>;
  }
  if (checkKey === 'brokenLinks') {
    return (
      <div>
        <p>Checked {data.total} link{data.total !== 1 ? 's' : ''}, {data.broken.length} broken.</p>
        {data.broken.length > 0 && (
          <ul className="broken-link-list">
            {data.broken.map((link) => (
              <li key={link.url}>
                <span className="broken-link-url">{link.url}</span>
                <span className="broken-link-code">{link.statusCode ?? link.error}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (checkKey === 'aiCrawlerAccess') {
    return (
      <div>
        <p>{data.allowed} of {data.total} AI crawlers allowed.</p>
        {data.blocked && data.blocked.length > 0 && (
          <p className="break-text">Blocked: {data.blocked.join(', ')}</p>
        )}
      </div>
    );
  }
  if (checkKey === 'antiBotAccess') {
    return (
      <p>
        Status code {data.statusCode ?? 'N/A'} when requested as an AI bot.
        {data.xRobotsTag && ` X-Robots-Tag: ${data.xRobotsTag}.`}
        {data.reason && ` ${data.reason}`}
      </p>
    );
  }
  if (checkKey === 'structuredData') {
    return (
      <p className="break-text">
        {data.found > 0
          ? `${data.found} structured data block${data.found !== 1 ? 's' : ''} found (${data.types.join(', ')}).`
          : 'No JSON-LD structured data found.'}
      </p>
    );
  }
  if (checkKey === 'llmsTxt') {
    return <p className="break-text">{data.url || data.reason || 'No further details.'}</p>;
  }
  if (checkKey === 'semanticHtml') {
    return (
      <p>
        {data.hasArticleOrSection ? 'Semantic <article>/<section> tags found. ' : 'No <article>/<section> tags found. '}
        {data.h1Count} H1 tag{data.h1Count !== 1 ? 's' : ''} found.
      </p>
    );
  }
  if (checkKey === 'jsDependence') {
    return <p>{data.wordCount} words detected in raw HTML.</p>;
  }
  return null;
}

function CheckRow({ checkKey, data, isCrawl, showFix = true }) {
  const [open, setOpen] = useState(false);
  const meta = CHECK_META[checkKey] || { label: checkKey };
  const fix = showFix && !isCrawl ? fixSuggestionFor(checkKey, data.status) : null;

  return (
    <div className={`check-row ${open ? 'check-row-open' : ''}`}>
      <button className="check-row-header" onClick={() => setOpen(!open)} aria-expanded={open}>
        <StatusBadge status={data.status} />
        <span className="check-row-label">{meta.label}</span>
        <span className="check-row-chevron">
          <ChevronIcon />
        </span>
      </button>
      {open && (
        <div className="check-row-details">
          <CheckDetails checkKey={checkKey} data={data} isCrawl={isCrawl} />
          {/* Crawl reports render their own fix note inside the aggregate
              branch of CheckDetails, so only single-page rows add it here. */}
          {fix && (
            <p className="fix-note">
              <strong>Suggested fix:</strong> {fix}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CapabilityGrid() {
  const standardGroups = GROUP_ORDER.map((title) => ({
    title,
    labels: Object.values(CHECK_META)
      .filter((m) => m.group === title)
      .map((m) => m.label),
  })).filter((g) => g.labels.length > 0);

  const seoGroups = Object.entries(SEO_MODULE_META).map(([title, labels]) => ({ title, labels }));

  const standardTotal = standardGroups.reduce((sum, g) => sum + g.labels.length, 0);
  const seoTotal = seoGroups.reduce((sum, g) => sum + g.labels.length, 0);

  return (
    <section aria-label="What each scan type covers">
      <div className="capability-modes-row">
        <div className="capability-mode">
          <div className="capability-mode-header">
            <span className="capability-mode-icon capability-mode-icon-standard" aria-hidden="true">
              <ShieldIcon />
            </span>
            <div>
              <h2 className="capability-mode-title">Standard Scan</h2>
              <p className="capability-mode-desc">
                SSL, accessibility, broken links, and AI crawler visibility — {standardTotal} checks total.
              </p>
            </div>
          </div>
          <div className="capability-grid">
            {standardGroups.map((g, i) => (
              <article key={g.title} className="capability-card" style={{ '--i': i }}>
                <header className="capability-head">
                  <h3 className="capability-title">{g.title}</h3>
                  <span className="capability-count">
                    {g.labels.length} check{g.labels.length !== 1 ? 's' : ''}
                  </span>
                </header>
                <ul className="capability-list">
                  {g.labels.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
  
        <div className="capability-mode capability-mode-seo">
          <div className="capability-mode-header">
            <span className="capability-mode-icon capability-mode-icon-seo" aria-hidden="true">
              <SearchIcon />
            </span>
            <div>
              <h2 className="capability-mode-title capability-mode-title-seo">SEO Audit</h2>
              <p className="capability-mode-desc">
                Meta tags, headings, images, URL structure, canonical, and indexability — {seoTotal} checks total.
              </p>
            </div>
          </div>
          <div className="capability-grid">
            {seoGroups.map((g, i) => (
              <article key={g.title} className="capability-card capability-card-seo" style={{ '--i': i }}>
                <header className="capability-head">
                  <h3 className="capability-title">{g.title}</h3>
                  <span className="capability-count">
                    {g.labels.length} check{g.labels.length !== 1 ? 's' : ''}
                  </span>
                </header>
                <ul className="capability-list">
                  {g.labels.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ReportSection({ title, checks, isCrawl, index }) {
  if (checks.length === 0) return null;
  return (
    <div className="report-section" style={{ '--i': index }}>
      <h3 className="report-section-title">{title}</h3>
      <div className="report-section-body">
        {checks.map(([key, data]) => (
          <CheckRow key={key} checkKey={key} data={data} isCrawl={isCrawl} />
        ))}
      </div>
    </div>
  );
}

function PageBreakdown({ pages }) {
  const [expandedUrl, setExpandedUrl] = useState(null);

  if (!pages || pages.length === 0) return null;

  function pageOverallStatus(page) {
    const statuses = Object.values(page.checks).map((c) => c.status);
    if (statuses.includes('fail')) return 'fail';
    if (statuses.includes('warning')) return 'warning';
    return 'pass';
  }

  return (
    <div className="page-breakdown">
      <h3 className="report-section-title">Pages Crawled ({pages.length})</h3>
      <div className="page-breakdown-list">
        {pages.map((page) => {
          const isOpen = expandedUrl === page.url;
          const status = pageOverallStatus(page);
          return (
            <div key={page.url} className={`page-breakdown-item ${isOpen ? 'check-row-open' : ''}`}>
              <button
                className="page-breakdown-header"
                onClick={() => setExpandedUrl(isOpen ? null : page.url)}
                aria-expanded={isOpen}
              >
                <StatusBadge status={status} />
                <span className="page-breakdown-url break-text">{page.url}</span>
                <span className="check-row-chevron">
                  <ChevronIcon />
                </span>
              </button>
              {isOpen && (
                <div className="page-breakdown-details">
                  {/* Per-page rows omit fix notes — the same advice already
                      appears once on the aggregate check above. */}
                  {Object.entries(page.checks).map(([key, data]) => (
                    <CheckRow key={key} checkKey={key} data={data} isCrawl={false} showFix={false} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NotificationBell({ notifications, open, onToggle, onClose, onMarkRead }) {
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const btnRef = useRef(null);
  const wrapRef = useRef(null);
  const closeTimerRef = useRef(null);
  const [pos, setPos] = useState(null);
  const [closing, setClosing] = useState(false);

  function beginClose() {
    setClosing(true);
    closeTimerRef.current = setTimeout(() => {
      onClose();
      setClosing(false);
    }, 200); // matches the fade-out CSS duration
  }

  function cancelClose() {
    clearTimeout(closeTimerRef.current);
    setClosing(false);
  }

  // Position the dropdown when it opens.
  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + 8,
        left: Math.min(rect.left, window.innerWidth - 272 - 16),
      });
    }
  }, [open]);

  // Auto-close after 3s of no hover.
  const autoCloseTimerRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    autoCloseTimerRef.current = setTimeout(beginClose, 3000);
    return () => clearTimeout(autoCloseTimerRef.current);
  }, [open]);

  // Close immediately on outside click.
  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        clearTimeout(autoCloseTimerRef.current);
        onClose();
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open, onClose]);

  function handleMouseEnter() {
    clearTimeout(autoCloseTimerRef.current);
    cancelClose();
  }

  function handleMouseLeave() {
    autoCloseTimerRef.current = setTimeout(beginClose, 3000);
  }

  return (
    <div className="notification-bell-wrap" ref={wrapRef}>
      <button
        ref={btnRef}
        className="notification-bell-btn"
        onClick={onToggle}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
      >
        <BellIcon />
        {unreadCount > 0 && <span className="notification-badge" aria-hidden="true">{unreadCount}</span>}
      </button>
      {open && pos && createPortal(
        <div
          className={`notification-dropdown ${closing ? 'notification-dropdown-closing' : ''}`}
          style={{ top: pos.top, left: pos.left }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {notifications.length === 0 && <p className="notification-empty">No notifications yet.</p>}
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`notification-item ${n.is_read ? '' : 'notification-unread'}`}
              onClick={() => !n.is_read && onMarkRead(n.id)}
            >
              <p className="break-text">{n.message}</p>
              <span className="notification-date">{new Date(n.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

function DownloadPdfButton({ reportId, token }) {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch(`http://localhost:3001/api/reports/${reportId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to generate PDF');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${reportId}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <button className="download-pdf-btn" onClick={handleDownload} disabled={downloading}>
      {downloading ? 'Generating…' : 'Download PDF'}
    </button>
  );
}

function ScheduledChecksList({ checks, onDelete }) {
  if (checks.length === 0) return null;
  return (
    <div className="scheduled-checks-list">
      <h3 className="history-title">Scheduled Checks</h3>
      <ul>
        {checks.map((c) => (
          <li key={c.id} className="scheduled-check-item">
            <span className="break-text">{c.url}</span>
            <span className="schedule-meta">{c.interval_type}</span>
            <button onClick={() => onDelete(c.id)} aria-label={`Remove ${c.interval_type} schedule for ${c.url}`}>
              <TrashIcon />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScoreChip({ score }) {
  if (score === undefined || score === null) return null;
  const num = Number(score);
  let color = GRADE_COLORS.F;
  if (num >= 90) color = GRADE_COLORS.S;
  else if (num >= 80) color = GRADE_COLORS.A;
  else if (num >= 70) color = GRADE_COLORS.B;
  else if (num >= 60) color = GRADE_COLORS.C;
  return (
    <span className="grade-badge grade-badge-score" style={{ background: color }}>
      {num}
      <span className="sr-only"> SEO score</span>
    </span>
  );
}

function Dropdown({ value, onChange, options, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = options.find((o) => o.value === value) || options[0];

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="filter-dropdown" ref={ref}>
      <button
        type="button"
        className="filter-dropdown-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        {current?.label}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <ul className="filter-dropdown-list" role="listbox">
          {options.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                className={`filter-dropdown-option ${opt.value === value ? 'filter-dropdown-option-active' : ''}`}
                role="option"
                aria-selected={opt.value === value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HistorySidebar({
  history, seoHistory, historyFilter, onFilterChange, onSelect, onDelete, onNew,
  activeId, activeSeoAuditId, activeKind, open, onClose, user, onRequestAuth, onLogout,
  scheduledChecks, onDeleteSchedule, notifications, notifOpen, onToggleNotif, onCloseNotif, onMarkNotificationRead,
}) {
  const combined = [
    ...history.map((item) => ({ ...item, kind: 'standard' })),
    ...seoHistory.map((item) => ({ ...item, kind: 'seo' })),
  ]
    .filter((item) => historyFilter === 'all' || item.kind === historyFilter)
    .sort((a, b) => new Date(b.checked_at) - new Date(a.checked_at));

  return (
    <>
      {open && <div className="sidebar-backdrop" onClick={onClose} />}
      <div className={`history-sidebar ${open ? 'history-sidebar-open' : ''}`}>
        <div className="brand">
          <span className="brand-mark">
            <ShieldIcon />
          </span>
          <span className="brand-name">
            Pre-Launch
            <span className="brand-sub">Checker</span>
          </span>
        </div>

        <button className="new-check-btn" onClick={onNew}>
          <PlusIcon />
          New Check
        </button>

        {user ? (
          <div className="account-row">
            <span className="account-email">{user.email}</span>
            <NotificationBell
              notifications={notifications}
              open={notifOpen}
              onToggle={onToggleNotif}
              onClose={onCloseNotif}
              onMarkRead={onMarkNotificationRead}
            />
            <button className="logout-btn" onClick={onLogout}>Log out</button>
          </div>
        ) : (
          <button className="login-btn" onClick={() => onRequestAuth('login')}>Log In</button>
        )}

        <div className="history-header-row">
          <h3 className="history-title">Recent Scans</h3>
          {user && (
            <Dropdown
              value={historyFilter}
              onChange={onFilterChange}
              ariaLabel="Filter scan history"
              options={[
                { value: 'all', label: 'All' },
                { value: 'standard', label: 'Standard' },
                { value: 'seo', label: 'SEO Audits' },
              ]}
            />
          )}
        </div>

        {!user && (
          <div className="history-login-prompt">
            <p>Log in to save and view your scan history.</p>
            <button onClick={() => onRequestAuth('login')}>Log In</button>
          </div>
        )}
        {user && combined.length === 0 && <p className="history-empty">No scans yet.</p>}
        {user && (
          <ul className="history-list">
            {combined.map((item) => {
              const isActive =
                activeKind === item.kind &&
                (item.kind === 'seo' ? activeSeoAuditId === item.id : activeId === item.id);
              return (
                <li key={`${item.kind}-${item.id}`} className="history-list-item">
                  <button
                    className={`history-item ${isActive ? 'history-item-active' : ''}`}
                    onClick={() => onSelect(item.id, item.kind)}
                    aria-current={isActive ? 'true' : undefined}
                  >
                    <div className="history-item-top">
                      <span className="history-url">{item.url}</span>
                      {item.kind === 'seo' ? <ScoreChip score={item.score} /> : <GradeBadge grade={item.grade} />}
                    </div>
                    <div className="history-item-meta">
                      <span className="history-date">{new Date(item.checked_at).toLocaleString()}</span>
                      {item.kind === 'seo' && <span className="history-kind-pill">SEO</span>}
                    </div>
                  </button>
                  <button
                    className="history-delete-btn"
                    onClick={(e) => onDelete(e, item.id, item.kind)}
                    aria-label={`Delete ${item.kind === 'seo' ? 'SEO audit' : 'scan'} of ${item.url}`}
                    title="Delete permanently"
                  >
                    <TrashIcon />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {user && <ScheduledChecksList checks={scheduledChecks} onDelete={onDeleteSchedule} />}
      </div>
    </>
  );
}

function AuthPage({ mode, onSuccess, onSwitchMode, onCancel }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:3001/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      onSuccess(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="grid-floor" aria-hidden="true" />
      <div className="auth-card">
        <button className="auth-back-btn" onClick={onCancel}>
          <ArrowLeftIcon />
          Back
        </button>
        <h2>{mode === 'login' ? 'Log In' : 'Create Account'}</h2>
        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>
          {error && <p className="error-text" role="alert">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>
        <p className="auth-switch">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button className="auth-switch-btn" onClick={() => onSwitchMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Sign up' : 'Log in'}
          </button>
        </p>
      </div>
    </div>
  );
}

function App() {
  const [url, setUrl] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [jobStatus, setJobStatus] = useState('idle');
  const [history, setHistory] = useState([]);
  const [activeReportId, setActiveReportId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const pollTimerRef = useRef(null);
  const consoleRef = useTilt({ max: 4 });

  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [authView, setAuthView] = useState(null);
  const [scheduledChecks, setScheduledChecks] = useState([]);
  const [scheduleInterval, setScheduleInterval] = useState('daily');
  const [scheduling, setScheduling] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [crawlEnabled, setCrawlEnabled] = useState(false);
  const [maxPages, setMaxPages] = useState(5);
  const [currentJobId, setCurrentJobId] = useState(null);
  const [auditKind, setAuditKind] = useState('standard'); // 'standard' | 'seo'
  const [seoAudit, setSeoAudit] = useState(null);
  const [seoHistory, setSeoHistory] = useState([]);
  const [historyFilter, setHistoryFilter] = useState('all'); // 'all' | 'standard' | 'seo'
  const [activeSeoAuditId, setActiveSeoAuditId] = useState(null);

  async function handleCancelScan() {
    if (!currentJobId) return;
    stopPolling();
    try {
      await fetch(`http://localhost:3001/api/check/${currentJobId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch (err) {
      console.error('Failed to cancel scan:', err);
    } finally {
      setJobStatus('cancelled');
      setCurrentJobId(null);
    }
  }

  async function refreshNotifications() {
    if (!token) {
      setNotifications([]);
      return;
    }
    try {
      const res = await fetch('http://localhost:3001/api/notifications', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  }

  useEffect(() => {
    refreshNotifications();
  }, [token]);

  // Clear any in-flight poll if the app unmounts mid-scan.
  useEffect(() => stopPolling, []);

  async function handleMarkNotificationRead(id) {
    try {
      await fetch(`http://localhost:3001/api/notifications/${id}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n))
      );
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  }

  async function refreshScheduledChecks() {
    if (!token) {
      setScheduledChecks([]);
      return;
    }
    try {
      const res = await fetch('http://localhost:3001/api/scheduled-checks', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setScheduledChecks(data);
    } catch (err) {
      console.error('Failed to load scheduled checks:', err);
    }
  }

  useEffect(() => {
    refreshScheduledChecks();
  }, [token]);

  async function handleCreateSchedule() {
    if (!report?.url) return;
    setScheduling(true);
    try {
      const res = await fetch('http://localhost:3001/api/scheduled-checks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url: report.url, intervalType: scheduleInterval }),
      });
      if (!res.ok) throw new Error('Failed to create scheduled check');
      await refreshScheduledChecks();
    } catch (err) {
      setError(err.message);
    } finally {
      setScheduling(false);
    }
  }

  async function handleDeleteSchedule(id) {
    try {
      const res = await fetch(`http://localhost:3001/api/scheduled-checks/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 204) throw new Error('Failed to delete');
      setScheduledChecks((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  function handleAuthSuccess(newToken, newUser) {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    setAuthView(null);
  }

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setHistory([]);
  }

  async function refreshHistory() {
    if (!token) {
      setHistory([]);
      return;
    }
    try {
      const res = await fetch('http://localhost:3001/api/reports', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setHistory([]);
        return;
      }
      const data = await res.json();
      setHistory(data);
    } catch (err) {
      console.error('Failed to load history:', err);
      setHistory([]);
    }
  }

  useEffect(() => {
    refreshHistory();
  }, [token]);

  async function refreshSeoHistory() {
    if (!token) {
      setSeoHistory([]);
      return;
    }
    try {
      const res = await fetch('http://localhost:3001/api/seo-reports', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setSeoHistory([]);
        return;
      }
      const data = await res.json();
      setSeoHistory(data);
    } catch (err) {
      console.error('Failed to load SEO audit history:', err);
      setSeoHistory([]);
    }
  }
  
  useEffect(() => {
    refreshSeoHistory();
  }, [token]);

function stopPolling() {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  function pollJob(jobId, kind) {
    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:3001/api/check/${jobId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
  
        if (data.status === 'completed') {
          if (kind === 'seo') {
            setSeoAudit(data.report);
            setActiveSeoAuditId(data.report.id || null);
            refreshSeoHistory();
          } else {
            setReport(data.report);
            setActiveReportId(data.report.id || null);
            refreshHistory();
          }
          setJobStatus('completed');
          setCurrentJobId(null);
          stopPolling();
        }  else if (data.status === 'failed') {
          setError(data.error || 'The check failed.');
          setJobStatus('failed');
          setCurrentJobId(null);
          stopPolling();
        } else {
          setJobStatus(data.status);
        }
      } catch (err) {
        setError(err.message);
        setJobStatus('failed');
        setCurrentJobId(null);
        stopPolling();
      }
    }, POLL_INTERVAL_MS);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    stopPolling();
    setError(null);
    setReport(null);
    setActiveReportId(null);
    setJobStatus('queued');
    setAuditKind('standard');

    try {
      const body = { url };
      if (crawlEnabled) {
        body.maxPages = maxPages;
      }

      const response = await fetch('http://localhost:3001/api/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Something went wrong');

      setCurrentJobId(data.jobId);
      pollJob(data.jobId, 'standard');
    } catch (err) {
      setError(err.message);
      setJobStatus('failed');
    }
  }

  async function handleSelectHistoryItem(id, kind) {
    stopPolling();
    setError(null);
    setJobStatus('idle');
    setSidebarOpen(false);
    setLoadingReport(true);
    setAuditKind(kind);
  
    if (kind === 'seo') {
      setActiveSeoAuditId(id);
      setActiveReportId(null);
      setReport(null);
      try {
        const res = await fetch(`http://localhost:3001/api/seo-reports/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to load that SEO audit');
        const data = await res.json();
        setSeoAudit(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoadingReport(false);
      }
      return;
    }
  
    setActiveReportId(id);
    setActiveSeoAuditId(null);
    setSeoAudit(null);
    try {
      const res = await fetch(`http://localhost:3001/api/reports/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load that report');
      const data = await res.json();
      setReport(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingReport(false);
    }
  }

  function handleNewCheck() {
    stopPolling();
    setUrl('');
    setReport(null);
    setError(null);
    setActiveReportId(null);
    setJobStatus('idle');
    setSidebarOpen(false);
    setLoadingReport(false);
    setCurrentJobId(null);
    setSeoAudit(null);
    setAuditKind('standard');
    setActiveSeoAuditId(null);
  }

  async function handleDeleteHistoryItem(e, id, kind) {
    e.stopPropagation();
    const confirmed = window.confirm('Permanently delete this scan? This cannot be undone.');
    if (!confirmed) return;
  
    const endpoint = kind === 'seo' ? `/api/seo-reports/${id}` : `/api/reports/${id}`;
    try {
      const res = await fetch(`http://localhost:3001${endpoint}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 204) throw new Error('Failed to delete');
  
      if (kind === 'seo') {
        setSeoHistory((prev) => prev.filter((item) => item.id !== id));
        if (activeSeoAuditId === id) {
          setSeoAudit(null);
          setActiveSeoAuditId(null);
        }
      } else {
        setHistory((prev) => prev.filter((item) => item.id !== id));
        if (activeReportId === id) {
          setReport(null);
          setActiveReportId(null);
        }
      }
    } catch (err) {
      setError(err.message);
    }
  }

  const isRunning = jobStatus === 'queued' || jobStatus === 'waiting' || jobStatus === 'active';
  const hasScheme = /^https?:\/\//i.test(url);

  const groupedChecks = report
  ? GROUP_ORDER.map((groupName) => ({
        title: groupName,
        checks: Object.entries(report.checks).filter(
          ([key]) => (CHECK_META[key]?.group || 'Other') === groupName
        ),
      }))
    : [];

    const is404 = Number(report?.checks?.accessible?.statusCode) === 404;

  if (authView) {
    return (
      <AuthPage
        mode={authView}
        onSuccess={handleAuthSuccess}
        onSwitchMode={setAuthView}
        onCancel={() => setAuthView(null)}
      />
    );
  }

  async function handleSeoAuditSubmit() {
    stopPolling();
    setError(null);
    setReport(null);
    setSeoAudit(null);
    setActiveReportId(null);
    setActiveSeoAuditId(null);
    setAuditKind('seo');
    setJobStatus('queued');
  
    try {
      const body = { url };
      if (crawlEnabled) {
        body.maxPages = maxPages;
      }
  
      const response = await fetch('http://localhost:3001/api/seo-audit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
  
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Something went wrong');
  
      setCurrentJobId(data.jobId);
      pollJob(data.jobId, 'seo');
    } catch (err) {
      setError(err.message);
      setJobStatus('failed');
    }
  }
  

  return (
    <div className="app-layout">
      <div className="grid-floor" aria-hidden="true" />

      <HistorySidebar
        history={history}
        seoHistory={seoHistory}
        historyFilter={historyFilter}
        onFilterChange={setHistoryFilter}
        onSelect={handleSelectHistoryItem}
        onDelete={handleDeleteHistoryItem}
        onNew={handleNewCheck}
        activeId={activeReportId}
        activeSeoAuditId={activeSeoAuditId}
        activeKind={auditKind}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        user={user}
        onRequestAuth={(mode) => setAuthView(mode)}
        onLogout={handleLogout}
        scheduledChecks={scheduledChecks}
        onDeleteSchedule={handleDeleteSchedule}
        notifications={notifications}
        notifOpen={notifOpen}
        onToggleNotif={() => setNotifOpen((prev) => !prev)}
        onCloseNotif={() => setNotifOpen(false)}
        onMarkNotificationRead={handleMarkNotificationRead}
      />

      <main className="app">
        <div className="mobile-topbar">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open scan history">
            <MenuIcon />
          </button>
          <span className="mobile-title">Pre-Launch Checker</span>
        </div>

        <header className="hero">
          <span className="hero-eyebrow">Have doughts in your Website? Let's fix it.</span>
          <h1 className="desktop-title">Ship with confidence.</h1>
          <p className="hero-lede">
            Run a standard scan for SSL, accessibility, broken links and AI crawler visibility,
            or a dedicated SEO Audit covering meta tags, headings, images, and indexability —
            before your site goes live.
          </p>
        </header>

        <div className="console-scene">
          <div ref={consoleRef} className="console glass tilt">
            <div className="tilt-sheen" aria-hidden="true" />

            <div className="console-bar">
              <span className="console-dots" aria-hidden="true">
                <span /><span /><span />
              </span>
              <span className="console-bar-title">target</span>
            </div>

            <form className="url-form" onSubmit={handleSubmit}>
              <div className="url-field">
                {!hasScheme && (
                  <span className="url-field-prefix" aria-hidden="true">
                    https://
                  </span>
                )}
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="example.com"
                  aria-label="Website URL to check"
                  autoComplete="url"
                  spellCheck="false"
                />
              </div>
              <button type="submit" className="scan-btn" disabled={isRunning}>
                {isRunning ? 'Scanning…' : 'Run Scan'}
              </button>
              <button
                type="button"
                className="seo-audit-btn"
                onClick={handleSeoAuditSubmit}
                disabled={isRunning}
              >
                {isRunning && auditKind === 'seo' ? 'Auditing…' : 'SEO Audit'}
              </button>

            </form>

            <div className="console-options">
              <label className="crawl-toggle">
                <input
                  type="checkbox"
                  checked={crawlEnabled}
                  onChange={(e) => setCrawlEnabled(e.target.checked)}
                />
                <span className="switch" aria-hidden="true" />
                Crawl multiple pages
              </label>

              {crawlEnabled && (
                <div className="crawl-options">
                  <label>
                    Max pages
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={maxPages}
                      onChange={(e) => setMaxPages(parseInt(e.target.value, 10) || 1)}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>

        {error && <p className="error-text" role="alert">{error}</p>}

        {jobStatus === 'cancelled' && (
          <p className="scan-cancelled-text" role="status">Scan cancelled.</p>
        )}

        {isRunning && (
          <ScanStage
            key={url}
            url={url}
            jobStatus={jobStatus}
            crawlEnabled={crawlEnabled}
            maxPages={maxPages}
            onCancel={handleCancelScan}
          />
        )}

        {!isRunning && loadingReport && <ReportSkeleton />}

        {!isRunning && jobStatus !== 'cancelled' && !loadingReport && !report && !seoAudit && !error && <CapabilityGrid />}

        {!isRunning && !loadingReport && report && (
          <div>
          {is404 && (
            <NotFoundBanner
              url={report.url}
              statusCode={report.checks.accessible.statusCode}
            />
          )}

          <ScoreReveal
            key={`${report.id ?? 'live'}-${report.checkedAt}`}
            report={report}
            fresh
            scrollOnMount={!is404}
          />

            {(user || report.isCrawl) && (
              <div className="scan-header-actions">
                {user && <DownloadPdfButton reportId={report.id} token={token} />}
                {user && (
                  <div className="schedule-control">
                    <Dropdown
                      value={scheduleInterval}
                      onChange={setScheduleInterval}
                      ariaLabel="Re-scan interval"
                      options={[
                        { value: 'daily', label: 'Daily' },
                        { value: 'weekly', label: 'Weekly' },
                      ]}
                    />
                    <button onClick={handleCreateSchedule} disabled={scheduling}>
                      {scheduling ? 'Scheduling…' : 'Schedule re-scan'}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="report-body">
              {groupedChecks.map((group, i) => (
                <ReportSection
                  key={group.title}
                  title={group.title}
                  checks={group.checks}
                  isCrawl={report.isCrawl}
                  index={i}
                />
              ))}
            </div>

            {report.isCrawl && <PageBreakdown pages={report.pages} />}
          </div>
        )}
        {!isRunning && auditKind === 'seo' && seoAudit && (
          <SeoAuditReport audit={seoAudit} token={token} />
        )}
      </main>
    </div>
  );
}

export default App;
