import { useScrollIntoView } from '../hooks/useMotion';

function UnpluggedIcon() {
    return (
      <svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path
          d="M170 10 C170 40, 130 40, 130 70"
          stroke="var(--color-fail)"
          strokeWidth="6"
          strokeLinecap="round"
          opacity="0.55"
        />
        <rect x="118" y="68" width="24" height="18" rx="4" fill="var(--color-fail)" opacity="0.5" />
        <path d="M124 86 L124 96 M136 86 L136 96" stroke="var(--color-fail)" strokeWidth="5" strokeLinecap="round" opacity="0.5" />
  
        <path
          d="M60 150 C60 120, 30 120, 30 90"
          stroke="var(--color-muted-foreground)"
          strokeWidth="6"
          strokeLinecap="round"
          opacity="0.4"
        />
        <rect x="18" y="72" width="24" height="18" rx="4" fill="var(--color-muted-foreground)" opacity="0.35" />
        <path d="M24 72 L24 62 M36 72 L36 62" stroke="var(--color-muted-foreground)" strokeWidth="5" strokeLinecap="round" opacity="0.35" />
  
        <g stroke="var(--color-fail)" strokeWidth="4" strokeLinecap="round" opacity="0.7">
          <line x1="78" y1="55" x2="70" y2="45" />
          <line x1="90" y1="48" x2="86" y2="36" />
          <line x1="72" y1="70" x2="60" y2="66" />
        </g>
      </svg>
    );
  }
  

    export default function NotFoundBanner({ url, statusCode }) {
    const bannerRef = useScrollIntoView(true, 550); 

    return (
        <div ref={bannerRef} className="notfound-banner glass">
        <div className="notfound-banner-art">
          <UnpluggedIcon />
        </div>
        <h2 className="notfound-banner-title">
          Website Returns <span className="notfound-banner-code">&nbsp;404 Not Found!</span>
        </h2>
        <p className="notfound-banner-sub break-text">
          {url} didn&apos;t resolve to a real page{statusCode ? ` (HTTP ${statusCode})` : ''}.
          The audit below still ran against whatever the server sent back.
        </p>
      </div>
    );
  }