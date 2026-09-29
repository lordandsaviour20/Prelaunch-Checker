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