export type Status = 'pass' | 'warning' | 'fail';

export interface AccessibleResult {
  status: Status;
  statusCode: number | null;
  responseTimeMs: number;
  error?: string;
  html: string | null;
}