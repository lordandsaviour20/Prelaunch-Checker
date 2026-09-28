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