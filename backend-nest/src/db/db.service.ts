import { Injectable, OnModuleDestroy } from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import { DbUser, RecentReportRow, ReportRow, SavedReport } from './db.types';

interface ReportLike {
  url: string;
  checkedAt: string;
  [key: string]: unknown;
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
}