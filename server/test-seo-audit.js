const { runSeoAudit } = require('./seo-audit');

const targetUrl = process.argv[2];

if (!targetUrl) {
  console.error('Usage: node test-seo-audit.js <url>');
  process.exit(1);
}

(async () => {
  console.log(`Running SEO audit on ${targetUrl}...\n`);
  const start = Date.now();

  try {
    const report = await runSeoAudit(targetUrl);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log(`Done in ${elapsed}s\n`);
    console.log(`Score: ${report.score}/100`);
    console.log(`Critical: ${report.summary.critical}  Warning: ${report.summary.warning}  Passed: ${report.summary.passed}\n`);

    for (const [key, mod] of Object.entries(report.modules)) {
      console.log(`--- ${mod.label} ---`);
      for (const f of mod.findings) {
        const tag = f.severity.toUpperCase().padEnd(8);
        console.log(`[${tag}] ${f.label}: ${f.detail}`);
        if (f.recommendation) console.log(`         → ${f.recommendation}`);
      }
      console.log('');
    }
  } catch (err) {
    console.error('Audit failed:', err.message);
    process.exit(1);
  }
})();