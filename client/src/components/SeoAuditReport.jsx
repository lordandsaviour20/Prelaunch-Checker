import { useState, useRef, useEffect } from 'react';

const SEVERITY_TO_STATUS = { passed: 'pass', warning: 'warning', critical: 'fail' };
const SEVERITY_LABEL = { passed: 'Passed', warning: 'Warning', critical: 'Critical' };
const MODULE_ORDER = ['metaTags', 'headings', 'images', 'url', 'canonical', 'indexability'];

const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  width: 13,
  height: 13,
  'aria-hidden': 'true',
};

function StatusGlyph({ status }) {
  if (status === 'pass') {
    return <svg {...svgProps}><polyline points="20 6 9 17 4 12" /></svg>;
  }
  if (status === 'warning') {
    return (
      <svg {...svgProps}>
        <line x1="12" y1="7" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    );
  }
  return (
    <svg {...svgProps}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SeverityBadge({ severity }) {
  const status = SEVERITY_TO_STATUS[severity] || 'fail';
  return (
    <span className={`status-badge status-${status}`}>
      <StatusGlyph status={status} />
      <span className="sr-only">{SEVERITY_LABEL[severity] || 'Unknown'}</span>
    </span>
  );
}

function FindingRow({ finding }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`check-row ${open ? 'check-row-open' : ''}`}>
      <button className="check-row-header" onClick={() => setOpen(!open)} aria-expanded={open}>
        <SeverityBadge severity={finding.severity} />
        <span className="check-row-label">{finding.label}</span>
        <span className="check-row-chevron">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>
      {open && (
        <div className="check-row-details">
          <p className="break-text">{finding.detail}</p>
          {finding.recommendation && (
            <p className="fix-note">
              <strong>Recommendation:</strong> {finding.recommendation}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Visual H1 -> H2 -> H3... hierarchy, indented by level - what the doc's
// Heading Structure Analyzer specifically asks for.
function HeadingTree({ tree }) {
  return (
    <div className="heading-tree">
      {tree.map((h, i) => (
        <div key={i} className="heading-tree-row" style={{ '--depth': h.level - 1 }}>
          <span className="heading-tree-tag">H{h.level}</span>
          <span className="heading-tree-text break-text">{h.text || <em>(empty)</em>}</span>
        </div>
      ))}
    </div>
  );
}

function ModuleSection({ mod, index }) {
  if (!mod.findings || mod.findings.length === 0) return null;
  return (
    <div className="report-section" style={{ '--i': index }}>
      <h3 className="report-section-title">{mod.label}</h3>
      <div className="report-section-body">
        {mod.findings.map((f) => (
          <FindingRow key={f.id} finding={f} />
        ))}
      </div>
      {mod.tree && mod.tree.length > 0 && <HeadingTree tree={mod.tree} />}
    </div>
  );
}

function PageStatusBadge({ status }) {
    return (
      <span className={`status-badge status-${status}`}>
        <StatusGlyph status={status} />
        <span className="sr-only">{status}</span>
      </span>
    );
  }
  
  function seoPageOverallStatus(summary) {
    if (!summary) return 'pass';
    if (summary.critical > 0) return 'fail';
    if (summary.warning > 0) return 'warning';
    return 'pass';
  }
  
  function SeoPageBreakdown({ pages }) {
    const [expandedUrl, setExpandedUrl] = useState(null);
  
    if (!pages || pages.length === 0) return null;
  
    return (
      <div className="page-breakdown">
        <h3 className="report-section-title">Pages Crawled ({pages.length})</h3>
        <div className="page-breakdown-list">
          {pages.map((page) => {
            const isOpen = expandedUrl === page.url;
            const status = seoPageOverallStatus(page.summary);
            return (
              <div key={page.url} className={`page-breakdown-item ${isOpen ? 'check-row-open' : ''}`}>
                <button
                  className="page-breakdown-header"
                  onClick={() => setExpandedUrl(isOpen ? null : page.url)}
                  aria-expanded={isOpen}
                >
                  <PageStatusBadge status={status} />
                  <span className="page-breakdown-url break-text">{page.url}</span>
                  <span className="page-breakdown-score">{page.score}/100</span>
                  <span className="check-row-chevron">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </span>
                </button>
                {isOpen && (
                  <div className="page-breakdown-details">
                    {MODULE_ORDER.filter((key) => page.modules[key]).map((key, i) => (
                      <ModuleSection key={key} mod={page.modules[key]} index={i} />
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

function ScoreDial({ score }) {
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 90 ? '#4ade80' : score >= 70 ? '#38bdf8' : score >= 50 ? '#fbbf24' : '#f87171';

  return (
    <div className="score-dial">
      <svg className="score-dial-svg" viewBox="0 0 140 140">
        <circle className="score-dial-track" cx="70" cy="70" r={radius} />
        <circle
          cx="70" cy="70" r={radius}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ filter: `drop-shadow(0 0 8px ${color}88)`, transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <div className="score-dial-center">
        <span className="score-grade" style={{ color, fontSize: '2rem' }}>{score}</span>
        <span className="score-number">/ 100</span>
      </div>
    </div>
  );
}

function DownloadSeoPdfButton({ auditId, token }) {
    const [downloading, setDownloading] = useState(false);
  
    async function handleDownload() {
      setDownloading(true);
      try {
        const res = await fetch(`http://localhost:3001/api/seo-reports/${auditId}/pdf`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to generate PDF');
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `seo-audit-${auditId}.pdf`;
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

  function ModuleScoreBreakdown({ moduleScores }) {
    if (!moduleScores || moduleScores.length === 0) return null;
    return (
      <div className="module-score-breakdown">
        {moduleScores.map((m) => (
          <div key={m.key} className="module-score-row">
            <span className="module-score-label">{m.label}</span>
            <span className="module-score-weight">weight {m.weight}</span>
            <span className="module-score-value">{m.score}/100</span>
          </div>
        ))}
      </div>
    );
  }

  export default function SeoAuditReport({ audit, token }) {
    const {
      url, checkedAt, score, summary, modules, isCrawl, pagesCrawled, pages,
      overallCapped, moduleScores,
    } = audit;
    const sceneRef = useRef(null);
   
    useEffect(() => {
      sceneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);
   
    return (
      <div>
        <div className="score-scene" ref={sceneRef}>
          <div className="score-card glass">
            <ScoreDial score={score} />
            <div className="score-meta">
              <p className="score-verdict">SEO Audit</p>
              <p className="score-url break-text">{url}</p>
              <p className="score-time">Checked {new Date(checkedAt).toLocaleString()}</p>
              {isCrawl && (
                <p className="score-time">Multi-page crawl — {pagesCrawled} page{pagesCrawled !== 1 ? 's' : ''} checked</p>
              )}
              {overallCapped && (
                <p className="fix-note">
                  <strong>Score capped:</strong> Indexability has a critical issue, so the overall
                  score is capped at 40 regardless of other findings.
                </p>
              )}
              <ul className="score-tally">
                <li className="tally tally-pass"><strong>{summary.passed}</strong>&nbsp;passed</li>
                <li className="tally tally-warning"><strong>{summary.warning}</strong>&nbsp;warnings</li>
                <li className="tally tally-fail"><strong>{summary.critical}</strong>&nbsp;critical</li>
              </ul>
              <ModuleScoreBreakdown moduleScores={moduleScores} />
              <div className="score-actions">
                {audit.id && <DownloadSeoPdfButton auditId={audit.id} token={token} />}
              </div>
            </div>
          </div>
        </div>
   
        <div className="report-body">
          {MODULE_ORDER.filter((key) => modules[key]).map((key, i) => (
            <ModuleSection key={key} mod={modules[key]} index={i} />
          ))}
        </div>
   
        {isCrawl && <SeoPageBreakdown pages={pages} />}
      </div>
    );
  }