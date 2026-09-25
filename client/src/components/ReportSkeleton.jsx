export default function ReportSkeleton() {
  return (
    <div className="report-skeleton" aria-busy="true" aria-label="Loading report">
      <div className="skeleton skeleton-card" />
      {[0, 1, 2].map((section) => (
        <div key={section} className="skeleton-section" style={{ '--i': section }}>
          <div className="skeleton skeleton-heading" />
          <div className="skeleton-rows">
            {[0, 1, 2].map((row) => (
              <div key={row} className="skeleton skeleton-row" />
            ))}
          </div>
        </div>
      ))}
      <span className="sr-only" role="status">
        Loading report…
      </span>
    </div>
  );
}
