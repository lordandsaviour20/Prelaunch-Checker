export interface ReportRow {
    id: number;
    url: string;
    checked_at: string;
    report_json: string | Record<string, unknown>;
    user_id: number | null;
  }
  
  export interface RecentReportRow {
    id: number;
    url: string;
    checked_at: string;
    grade: string | null;
  }
  
  export interface SavedReport {
    id: number;
    url: string;
    checkedAt: string;
    score: number;
    grade: string;
    checks: Record<string, unknown>;
    [key: string]: unknown;
  }
  
  export interface DbUser {
    id: number;
    email: string;
    password_hash?: string;
  }