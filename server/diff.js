const CHECK_LABELS = {
  accessible: 'Website Accessible',
  ssl: 'SSL Certificate',
  title: 'Page Title',
  metaDescription: 'Meta Description',
  sitemap: 'Sitemap Available',
  robotsTxt: 'Robots.txt Available',
  viewport: 'Mobile Viewport',
  imagesAlt: 'Images Missing Alt Text',
  brokenLinks: 'Broken Links',
  aiCrawlerAccess: 'AI Crawler Access',
  antiBotAccess: 'Anti-Bot / Header Check',
  structuredData: 'Structured Data (JSON-LD)',
  llmsTxt: 'llms.txt',
  semanticHtml: 'Semantic HTML',
  jsDependence: 'JS Dependence',
};
  
  function findNewlyFailedChecks(previousReport, newReport) {
    if (!previousReport) return [];
  
    const newlyFailed = [];
    for (const [key, data] of Object.entries(newReport.checks)) {
      const newStatus = data.status;
      const oldStatus = previousReport.checks?.[key]?.status;
  
      if (newStatus === 'fail' && oldStatus !== 'fail') {
        newlyFailed.push(CHECK_LABELS[key] || key);
      }
    }
    return newlyFailed;
  }
  
  module.exports = { findNewlyFailedChecks };