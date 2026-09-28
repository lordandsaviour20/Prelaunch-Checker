export type Status = 'pass' | 'warning' | 'fail';

export interface AccessibleResult {
  status: Status;
  statusCode: number | null;
  responseTimeMs: number;
  error?: string;
  html: string | null;
}

export interface TitleResult {
    status: Status;
    value: string;
    length: number;
  }
  
  export interface MetaDescriptionResult {
    status: Status;
    value: string;
    length: number;
  }
  
  export interface ViewportResult {
    status: Status;
    value?: string;
  }
  
  export interface ImagesAltResult {
    status: Status;
    total: number;
    missingAlt: number;
    missingAltList: string[];
  }

  export interface RobotsResult {
    status: Status;
    reason?: string;
    content?: string;
  }
  
  export interface SitemapResult {
    status: Status;
    url?: string;
    reason?: string;
  }
  
  export interface SslResult {
    status: Status;
    reason?: string;
    validTo?: string;
    issuer?: string;
    daysRemaining?: number;
  }

  export interface LinkCheckResult {
    url: string;
    statusCode: number | null;
    ok: boolean;
    error?: string;
  }
  
  export interface BrokenLinksResult {
    status: Status;
    total: number;
    broken: { url: string; statusCode: number | null; error?: string }[];
  }

  