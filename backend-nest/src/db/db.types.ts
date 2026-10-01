import { CheckMap } from '../checks/checks.types';
import { SeoAuditReport, SeoAuditCrawlReport } from '../seo-audit/seo-audit.types';

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
    checks: CheckMap;
    [key: string]: unknown;
  }
  
  export interface DbUser {
    id: number;
    email: string;
    password_hash?: string;
  }

  export interface ScheduledCheckRow {
    id: number;
    user_id: number;
    url: string;
    interval_type: string;
    is_active: boolean | number;
    last_run: string | null;
    next_run: string;
    created_at: string;
  }
  
  export interface NotificationRow {
    id: number;
    user_id: number;
    scheduled_check_id: number | null;
    report_id: number | null;
    message: string;
    is_read: boolean | number;
    created_at: string;
  }
  
  export interface SeoAuditRow {
    id: number;
    url: string;
    checked_at: string;
    audit_json: string | Record<string, unknown>;
    user_id: number | null;
  }
  
  export interface RecentSeoAuditRow {
    id: number;
    url: string;
    checked_at: string;
    score: string | null;
  }
  
  export interface SavedSeoAudit {
    id: number;
    url: string;
    checkedAt: string;
    score: number;
    [key: string]: unknown;
  }

  export interface SavedSeoAudit extends Omit<SeoAuditReport | SeoAuditCrawlReport, 'id'> {
    id: number;
  }