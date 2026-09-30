import type { CheerioAPI } from 'cheerio';

export type Severity = 'passed' | 'warning' | 'critical';

export interface Finding {
  id: string;
  label: string;
  severity: Severity;
  detail: string;
  recommendation: string | null;
}

export interface ModuleResult {
  label?: string;
  findings: Finding[];
}

export interface HeadingNode {
  level: number;
  tag: string;
  text: string;
}

export interface ImageDetail {
  src: string;
  alt: string | undefined;
  width: string | undefined;
  height: string | undefined;
  loading: string | undefined;
}

export interface ImageWithMetadata extends ImageDetail {
  sizeBytes: number | null;
  contentType: string | null;
  statusCode?: number;
  error?: string;
}

export interface ImageAnalysisResult extends ModuleResult {
    images: ImageDetail[];
  }
  
  export interface ImageMetadataResult {
    findings: Finding[];
    imagesWithMetadata: ImageWithMetadata[];
  }
  export interface CanonicalResult extends ModuleResult {
    canonicalUrl: string | null;
    isSelfReferencing: boolean | null;
  }
  
  export interface IndexabilityInput {
    $?: CheerioAPI;
    pageUrl: string;
    statusCode: number | null;
    robotsMetaContent: string | null;
    xRobotsTagHeader: string | null;
    canonicalUrl: string | null;
    isSelfReferencing: boolean | null;
  }
  
  export interface IndexabilityResult extends ModuleResult {
    verdict: 'Indexable' | 'Not indexable' | 'Uncertain';
    reasons: string[];
  }

  export interface ModuleScore {
    key: string;
    label: string;
    score: number;
    weight: number;
    findingCount: number;
  }
  
  export interface AuditSummary {
    critical: number;
    warning: number;
    passed: number;
    total: number;
  }
  
  export interface ScoredModules {
    score: number;
    overallCapped: boolean;
    summary: AuditSummary;
    moduleScores: ModuleScore[];
  }
  
  export interface SeoAuditReport extends ScoredModules {
    url: string;
    checkedAt: string;
    modules: Record<string, ModuleResult>;
    internalLinks?: string[];
  }
  
  export interface RunSeoAuditOptions {
    rootHostname?: string;
  }

  export interface SeoAuditPageResult extends ScoredModules {
    url: string;
    modules: Record<string, ModuleResult>;
    fetchError?: string;
  }
  
  export interface AggregatedSeoFinding {
    id: string;
    label: string;
    severity: Severity;
    detail: string;
    recommendation: string | null;
    issues: { url: string; severity: Severity; detail: string }[];
  }
  
  export interface AggregatedSeoModule {
    label: string;
    findings: AggregatedSeoFinding[];
  }
  
  export interface SeoAuditCrawlReport extends ScoredModules {
    url: string;
    checkedAt: string;
    modules: Record<string, AggregatedSeoModule>;
    isCrawl: true;
    pagesCrawled: number;
    pages: { url: string; modules: Record<string, ModuleResult>; score: number; summary: AuditSummary }[];
  }