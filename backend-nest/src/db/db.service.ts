import { Injectable, OnModuleDestroy } from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import {
    DbUser,
    NotificationRow,
    RecentReportRow,
    RecentSeoAuditRow,
    ReportRow,
    SavedReport,
    SavedSeoAudit,
    ScheduledCheckRow,
    SeoAuditRow,
  } from './db.types';

interface ReportLike {
  url: string;
  checkedAt: string;
}

interface SeoAuditLike {
    url: string;
    checkedAt: string;
  }

@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly pool: mysql.Pool;

  constructor() {
    this.pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
    });
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  private toMySQLDatetime(isoString: string): string {
    return new Date(isoString).toISOString().slice(0, 19).replace('T', ' ');
  }

  private parseJsonColumn<T>(value: string | T): T {
    return typeof value === 'string' ? (JSON.parse(value) as T) : value;
  }

  // --- Reports ---

  async saveReport(report: ReportLike, userId: number | null = null): Promise<number> {
    const [result] = await this.pool.query(
      'INSERT INTO reports (url, checked_at, report_json, user_id) VALUES (?, ?, ?, ?)',
      [report.url, this.toMySQLDatetime(report.checkedAt), JSON.stringify(report), userId],
    );
    return (result as mysql.ResultSetHeader).insertId;
  }

  async getRecentReports(userId: number): Promise<RecentReportRow[]> {
    const [rows] = await this.pool.query(
      `SELECT id, url, checked_at,
              JSON_UNQUOTE(JSON_EXTRACT(report_json, '$.grade')) AS grade
       FROM reports
       WHERE user_id = ?
       ORDER BY checked_at DESC
       LIMIT 50`,
      [userId],
    );
    return rows as RecentReportRow[];
  }

  async getReportById(id: number, userId: number): Promise<SavedReport | null> {
    const [rows] = await this.pool.query(
      'SELECT * FROM reports WHERE id = ? AND user_id = ?',
      [id, userId],
    );
    const row = (rows as ReportRow[])[0];
    if (!row) return null;
    const report = this.parseJsonColumn<SavedReport>(row.report_json as string);
    return { ...report, id: row.id };
  }

  async deleteReport(id: number, userId: number): Promise<boolean> {
    const [result] = await this.pool.query(
      'DELETE FROM reports WHERE id = ? AND user_id = ?',
      [id, userId],
    );
    return (result as mysql.ResultSetHeader).affectedRows > 0;
  }

  async getPreviousReport(
    userId: number,
    url: string,
    beforeCheckedAt: string,
  ): Promise<SavedReport | null> {
    const [rows] = await this.pool.query(
      `SELECT * FROM reports
       WHERE user_id = ? AND url = ? AND checked_at < ?
       ORDER BY checked_at DESC
       LIMIT 1`,
      [userId, url, beforeCheckedAt],
    );
    const row = (rows as ReportRow[])[0];
    if (!row) return null;
    const report = this.parseJsonColumn<SavedReport>(row.report_json as string);
    return { ...report, id: row.id };
  }

  async deleteOldReports(): Promise<number> {
    const [result] = await this.pool.query(
      `DELETE r FROM reports r
       WHERE r.checked_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
       AND NOT EXISTS (
         SELECT 1 FROM scheduled_checks sc
         WHERE sc.user_id = r.user_id
           AND sc.url = r.url
           AND sc.is_active = TRUE
       )`,
    );
    return (result as mysql.ResultSetHeader).affectedRows;
  }

  // --- Users ---

  async createUser(email: string, passwordHash: string): Promise<{ id: number; email: string }> {
    const [result] = await this.pool.query(
      'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      [email, passwordHash],
    );
    return { id: (result as mysql.ResultSetHeader).insertId, email };
  }

  async getUserByEmail(email: string): Promise<DbUser | null> {
    const [rows] = await this.pool.query('SELECT * FROM users WHERE email = ?', [email]);
    return (rows as DbUser[])[0] || null;
  }

  async getUserById(id: number): Promise<DbUser | null> {
    const [rows] = await this.pool.query('SELECT id, email FROM users WHERE id = ?', [id]);
    return (rows as DbUser[])[0] || null;
  }
    // --- Scheduled Checks ---

    private intervalToMs(intervalType: string): number {
        return intervalType === 'weekly'
          ? 7 * 24 * 60 * 60 * 1000
          : 24 * 60 * 60 * 1000;
      }
    
      async createScheduledCheck(
        userId: number,
        url: string,
        intervalType: string,
      ): Promise<number> {
        const nextRun = this.toMySQLDatetime(
          new Date(Date.now() + this.intervalToMs(intervalType)).toISOString(),
        );
        const [result] = await this.pool.query(
          'INSERT INTO scheduled_checks (user_id, url, interval_type, next_run) VALUES (?, ?, ?, ?)',
          [userId, url, intervalType, nextRun],
        );
        return (result as mysql.ResultSetHeader).insertId;
      }
    
      async getScheduledChecksByUser(userId: number): Promise<ScheduledCheckRow[]> {
        const [rows] = await this.pool.query(
          'SELECT * FROM scheduled_checks WHERE user_id = ? ORDER BY created_at DESC',
          [userId],
        );
        return rows as ScheduledCheckRow[];
      }
    
      async deleteScheduledCheck(id: number, userId: number): Promise<boolean> {
        const [result] = await this.pool.query(
          'DELETE FROM scheduled_checks WHERE id = ? AND user_id = ?',
          [id, userId],
        );
        return (result as mysql.ResultSetHeader).affectedRows > 0;
      }
    
      async getDueScheduledChecks(): Promise<ScheduledCheckRow[]> {
        const [rows] = await this.pool.query(
          'SELECT * FROM scheduled_checks WHERE is_active = TRUE AND next_run <= NOW()',
        );
        return rows as ScheduledCheckRow[];
      }
    
      async markScheduledCheckRun(id: number, intervalType: string): Promise<void> {
        const now = this.toMySQLDatetime(new Date().toISOString());
        const nextRun = this.toMySQLDatetime(
          new Date(Date.now() + this.intervalToMs(intervalType)).toISOString(),
        );
        await this.pool.query(
          'UPDATE scheduled_checks SET last_run = ?, next_run = ? WHERE id = ?',
          [now, nextRun, id],
        );
      }
    
      // --- Notifications ---
    
      async createNotification(
        userId: number,
        message: string,
        {
          scheduledCheckId = null,
          reportId = null,
        }: { scheduledCheckId?: number | null; reportId?: number | null } = {},
      ): Promise<number> {
        const [result] = await this.pool.query(
          'INSERT INTO notifications (user_id, scheduled_check_id, report_id, message) VALUES (?, ?, ?, ?)',
          [userId, scheduledCheckId, reportId, message],
        );
        return (result as mysql.ResultSetHeader).insertId;
      }
    
      async getNotificationsByUser(userId: number): Promise<NotificationRow[]> {
        const [rows] = await this.pool.query(
          'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
          [userId],
        );
        return rows as NotificationRow[];
      }
    
      async markNotificationRead(id: number, userId: number): Promise<boolean> {
        const [result] = await this.pool.query(
          'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
          [id, userId],
        );
        return (result as mysql.ResultSetHeader).affectedRows > 0;
      }
    
      // --- SEO Audits ---
    
      async saveSeoAudit(audit: SeoAuditLike, userId: number | null = null): Promise<number> {
        const [result] = await this.pool.query(
          'INSERT INTO seo_audits (url, checked_at, audit_json, user_id) VALUES (?, ?, ?, ?)',
          [audit.url, this.toMySQLDatetime(audit.checkedAt), JSON.stringify(audit), userId],
        );
        return (result as mysql.ResultSetHeader).insertId;
      }
    
      async getRecentSeoAudits(userId: number): Promise<RecentSeoAuditRow[]> {
        const [rows] = await this.pool.query(
          `SELECT id, url, checked_at,
                  JSON_UNQUOTE(JSON_EXTRACT(audit_json, '$.score')) AS score
           FROM seo_audits
           WHERE user_id = ?
           ORDER BY checked_at DESC
           LIMIT 50`,
          [userId],
        );
        return rows as RecentSeoAuditRow[];
      }
    
      async getSeoAuditById(id: number, userId: number): Promise<SavedSeoAudit | null> {
        const [rows] = await this.pool.query(
          'SELECT * FROM seo_audits WHERE id = ? AND user_id = ?',
          [id, userId],
        );
        const row = (rows as SeoAuditRow[])[0];
        if (!row) return null;
        const audit = this.parseJsonColumn<SavedSeoAudit>(row.audit_json as string);
        return { ...audit, id: row.id };
      }
    
      async deleteSeoAudit(id: number, userId: number): Promise<boolean> {
        const [result] = await this.pool.query(
          'DELETE FROM seo_audits WHERE id = ? AND user_id = ?',
          [id, userId],
        );
        return (result as mysql.ResultSetHeader).affectedRows > 0;
      }
}