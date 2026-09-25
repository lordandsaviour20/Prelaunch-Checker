import { useEffect, useRef, useState } from 'react';
import ScanOrb from './ScanOrb';
import { useReducedMotion, useScrollIntoView } from '../hooks/useMotion';

/**
 * The pipeline the backend actually walks, with rough elapsed-time offsets.
 *
 * The API only reports queued | active | completed, so these offsets are an
 * *estimate* of where the worker is — not a measured progress report. Two rules
 * keep that honest: the final stage never self-completes (it holds until the
 * server says the job is done), and the text announced to assistive tech only
 * ever states the real job status plus real elapsed time.
 */
const PIPELINE = [
  { at: 0.0, label: 'Resolving host' },
  { at: 1.4, label: 'Fetching page' },
  { at: 3.2, label: 'Validating TLS certificate' },
  { at: 5.4, label: 'Parsing HTML & metadata' },
  { at: 8.0, label: 'Auditing SEO signals' },
  { at: 11.0, label: 'Checking accessibility' },
  { at: 14.5, label: 'Probing links' },
  { at: 18.5, label: 'Testing AI crawler visibility' },
  { at: 23.0, label: 'Compiling report' },
];

function CheckGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function formatElapsed(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

export default function ScanStage({ url, jobStatus, crawlEnabled, maxPages, onCancel }) {
  const [elapsed, setElapsed] = useState(0);
  const startedRef = useRef(0);
  const reduced = useReducedMotion();
  const sectionRef = useScrollIntoView();

  const queued = jobStatus === 'queued' || jobStatus === 'waiting';
  const active = jobStatus === 'active';

  // The caller keys this component by URL, so a new scan remounts it and the
  // clock restarts from zero without needing a reset effect.
  useEffect(() => {
    startedRef.current = performance.now();
    // 1s tick: a real measured value, so it keeps running even under
    // reduced-motion (it's information, not decoration).
    const id = setInterval(() => setElapsed(performance.now() - startedRef.current), 1000);
    return () => clearInterval(id);
  }, []);

  // Crawling N pages genuinely takes longer, so stretch the estimate to match.
  const stretch = crawlEnabled ? 1 + Math.max(0, (maxPages - 1)) * 0.55 : 1;
  const seconds = active ? elapsed / 1000 : 0;

  let currentIndex = -1;
  if (active) {
    currentIndex = 0;
    for (let i = 0; i < PIPELINE.length; i++) {
      if (seconds >= PIPELINE[i].at * stretch) currentIndex = i;
    }
  }

  const statusLine = queued
    ? 'Queued — waiting for an available worker'
    : active
      ? `Running checks · ${formatElapsed(elapsed)} elapsed`
      : 'Starting scan';

  return (
    <section ref={sectionRef} className="scan-stage" aria-busy="true" aria-labelledby="scan-stage-title">
      <div className="scan-stage-aurora" aria-hidden="true" />

      <div className="scan-stage-orb">
        <ScanOrb size={240} running={active} />
      </div>

      <h2 id="scan-stage-title" className="scan-stage-title">
        {queued ? 'Queued' : 'Scanning'}
        <span className="scan-stage-target break-text">{url}</span>
      </h2>

      {/* The only text announced to screen readers — always the true state. */}
      <p className="scan-stage-status" role="status" aria-live="polite">
        {statusLine}
      </p>

      {/* Indeterminate by design: the API reports no percentage, so showing one
          would be a fabricated number. */}
      <div
        className="scan-beam"
        role="progressbar"
        aria-label="Scan in progress"
        aria-valuetext={statusLine}
      >
        <span className="scan-beam-fill" />
      </div>

      <ol className="pipeline" aria-hidden="true">
        {PIPELINE.map((step, i) => {
          const state = !active ? 'pending' : i < currentIndex ? 'done' : i === currentIndex ? 'active' : 'pending';
          return (
            <li
              key={step.label}
              className={`pipeline-step pipeline-${state}`}
              style={{ '--i': i, '--total': PIPELINE.length }}
            >
              <span className="pipeline-marker">
                {state === 'done' ? <CheckGlyph /> : <span className="pipeline-dot" />}
              </span>
              <span className="pipeline-label">{step.label}</span>
              {state === 'active' && !reduced && <span className="pipeline-shimmer" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>

      {crawlEnabled && (
        <p className="scan-stage-note">
          Crawling up to {maxPages} page{maxPages !== 1 ? 's' : ''} — this takes longer than a single-page scan.
        </p>
      )}

      <button type="button" className="scan-stop-btn" onClick={onCancel}>
        Stop Scan
      </button>
    </section>
  );
}
