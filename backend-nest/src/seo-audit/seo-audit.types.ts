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