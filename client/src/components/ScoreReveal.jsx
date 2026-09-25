import { useCountUp, useTilt, useScrollIntoView } from '../hooks/useMotion';

const GRADE_TONE = {
  S: { ring: '#a855f7', glow: 'rgba(168, 85, 247, 0.55)', label: 'Exceptional' },
  A: { ring: '#22c55e', glow: 'rgba(34, 197, 94, 0.55)', label: 'Launch ready' },
  B: { ring: '#38bdf8', glow: 'rgba(56, 189, 248, 0.55)', label: 'Solid, minor gaps' },
  C: { ring: '#fbbf24', glow: 'rgba(251, 191, 36, 0.55)', label: 'Needs work' },
  F: { ring: '#f87171', glow: 'rgba(248, 113, 113, 0.55)', label: 'Not ready' },
};

const RADIUS = 56;
const CIRCUM = 2 * Math.PI * RADIUS;

export default function ScoreReveal({ report, fresh, scrollOnMount = true }) {
  const tiltRef = useTilt({ max: 7 });
  const sceneRef = useScrollIntoView(scrollOnMount);

  const score = typeof report.score === 'number' ? report.score : 0;
  const grade = report.grade || 'F';
  const tone = GRADE_TONE[grade] || GRADE_TONE.F;
  const shown = useCountUp(score, { duration: 1500, enabled: fresh });
  const offset = CIRCUM * (1 - score / 100);

  const tally = Object.values(report.checks || {}).reduce(
    (acc, c) => {
      if (c.status === 'pass') acc.pass++;
      else if (c.status === 'warning') acc.warning++;
      else if (c.status === 'fail') acc.fail++;
      return acc;
    },
    { pass: 0, warning: 0, fail: 0 }
  );

  return (
    <div ref={sceneRef} className="score-scene">
      <div
        ref={tiltRef}
        className="score-card glass tilt"
        style={{ '--grade-ring': tone.ring, '--grade-glow': tone.glow }}
      >
        <div className="tilt-sheen" aria-hidden="true" />

        <div className="score-dial">
          <svg viewBox="0 0 140 140" className="score-dial-svg" aria-hidden="true">
            <defs>
              <linearGradient id="score-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={tone.ring} stopOpacity="0.65" />
                <stop offset="100%" stopColor={tone.ring} />
              </linearGradient>
            </defs>
            <circle className="score-dial-track" cx="70" cy="70" r={RADIUS} />
            <circle
              className="score-dial-value"
              cx="70"
              cy="70"
              r={RADIUS}
              stroke="url(#score-grad)"
              strokeDasharray={CIRCUM}
              strokeDashoffset={offset}
              style={{ '--circum': CIRCUM, '--offset': offset }}
            />
          </svg>

          <div className="score-dial-center">
            <span className="score-grade">{grade}</span>
            <span className="score-number">
              {shown}
              <span className="score-number-max">/100</span>
            </span>
          </div>
        </div>

        <div className="score-meta">
          <p className="score-verdict">{tone.label}</p>
          <p className="score-url break-text">{report.url}</p>
          <p className="score-time">{new Date(report.checkedAt).toLocaleString()}</p>

          <ul className="score-tally">
            <li className="tally tally-pass">
              <strong>{tally.pass}</strong> passed
            </li>
            <li className="tally tally-warning">
              <strong>{tally.warning}</strong> warnings
            </li>
            <li className="tally tally-fail">
              <strong>{tally.fail}</strong> failed
            </li>
          </ul>
        </div>
      </div>

      {/* One plain-language summary for screen readers, instead of making them
          parse the dial, the tally chips and the letter separately. */}
      <p className="sr-only" role="status">
        Scan complete. {report.url} scored {score} out of 100, grade {grade} — {tone.label}.{' '}
        {tally.pass} checks passed, {tally.warning} warnings, {tally.fail} failed.
      </p>
    </div>
  );
}
