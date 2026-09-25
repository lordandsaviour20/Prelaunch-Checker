require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

function toMySQLDatetime(isoString) {
  return new Date(isoString).toISOString().slice(0, 19).replace('T', ' ');
}

async function saveReport(report, userId = null) {
  const [result] = await pool.query(
    'INSERT INTO reports (url, checked_at, report_json, user_id) VALUES (?, ?, ?, ?)',
    [report.url, toMySQLDatetime(report.checkedAt), JSON.stringify(report), userId]
  );
  return result.insertId;
}

async function getRecentReports(userId) {
  const [rows] = await pool.query(
    `SELECT id, url, checked_at,
            JSON_UNQUOTE(JSON_EXTRACT(report_json, '$.grade')) AS grade
     FROM reports
     WHERE user_id = ?
     ORDER BY checked_at DESC
     LIMIT 50`,
    [userId]
  );
  return rows;
}

async function getReportById(id, userId) {
  const [rows] = await pool.query('SELECT * FROM reports WHERE id = ? AND user_id = ?', [id, userId]);
  if (!rows[0]) return null;
  const row = rows[0];
  const report = typeof row.report_json === 'string' ? JSON.parse(row.report_json) : row.report_json;
  return { ...report, id: row.id };
}

async function deleteReport(id, userId) {
  const [result] = await pool.query('DELETE FROM reports WHERE id = ? AND user_id = ?', [id, userId]);
  return result.affectedRows > 0;
}

async function createUser(email, passwordHash) {
  const [result] = await pool.query(
    'INSERT INTO users (email, password_hash) VALUES (?, ?)',
    [email, passwordHash]
  );
  return { id: result.insertId, email };
}

async function getUserByEmail(email) {
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  return rows[0] || null;
}

async function getUserById(id) {
  const [rows] = await pool.query('SELECT id, email FROM users WHERE id = ?', [id]);
  return rows[0] || null;
}

// --- Scheduled Checks ---

function intervalToMs(intervalType) {
  return intervalType === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
}

async function createScheduledCheck(userId, url, intervalType) {
  const nextRun = toMySQLDatetime(new Date(Date.now() + intervalToMs(intervalType)).toISOString());
  const [result] = await pool.query(
    'INSERT INTO scheduled_checks (user_id, url, interval_type, next_run) VALUES (?, ?, ?, ?)',
    [userId, url, intervalType, nextRun]
  );
  return result.insertId;
}

async function getScheduledChecksByUser(userId) {
  const [rows] = await pool.query(
    'SELECT * FROM scheduled_checks WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );
  return rows;
}

async function deleteScheduledCheck(id, userId) {
  const [result] = await pool.query(
    'DELETE FROM scheduled_checks WHERE id = ? AND user_id = ?',
    [id, userId]
  );
  return result.affectedRows > 0;
}

async function getDueScheduledChecks() {
  const [rows] = await pool.query(
    'SELECT * FROM scheduled_checks WHERE is_active = TRUE AND next_run <= NOW()'
  );
  return rows;
}

async function markScheduledCheckRun(id, intervalType) {
  const now = toMySQLDatetime(new Date().toISOString());
  const nextRun = toMySQLDatetime(new Date(Date.now() + intervalToMs(intervalType)).toISOString());
  await pool.query(
    'UPDATE scheduled_checks SET last_run = ?, next_run = ? WHERE id = ?',
    [now, nextRun, id]
  );
}

// --- Notifications ---

async function createNotification(userId, message, { scheduledCheckId = null, reportId = null } = {}) {
  const [result] = await pool.query(
    'INSERT INTO notifications (user_id, scheduled_check_id, report_id, message) VALUES (?, ?, ?, ?)',
    [userId, scheduledCheckId, reportId, message]
  );
  return result.insertId;
}

async function getNotificationsByUser(userId) {
  const [rows] = await pool.query(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
    [userId]
  );
  return rows;
}

async function markNotificationRead(id, userId) {
  const [result] = await pool.query(
    'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
    [id, userId]
  );
  return result.affectedRows > 0;
}

async function getPreviousReport(userId, url, beforeCheckedAt) {
  const [rows] = await pool.query(
    `SELECT * FROM reports
     WHERE user_id = ? AND url = ? AND checked_at < ?
     ORDER BY checked_at DESC
     LIMIT 1`,
    [userId, url, beforeCheckedAt]
  );
  if (!rows[0]) return null;
  const row = rows[0];
  const report = typeof row.report_json === 'string' ? JSON.parse(row.report_json) : row.report_json;
  return { ...report, id: row.id };
}

async function deleteOldReports() {
  const [result] = await pool.query(
    `DELETE r FROM reports r
     WHERE r.checked_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
     AND NOT EXISTS (
       SELECT 1 FROM scheduled_checks sc
       WHERE sc.user_id = r.user_id
         AND sc.url = r.url
         AND sc.is_active = TRUE
     )`
  );
  return result.affectedRows;
}

async function saveSeoAudit(audit, userId = null) {
  const [result] = await pool.query(
    'INSERT INTO seo_audits (url, checked_at, audit_json, user_id) VALUES (?, ?, ?, ?)',
    [audit.url, toMySQLDatetime(audit.checkedAt), JSON.stringify(audit), userId]
  );
  return result.insertId;
}
 
async function getRecentSeoAudits(userId) {
  const [rows] = await pool.query(
    `SELECT id, url, checked_at,
            JSON_UNQUOTE(JSON_EXTRACT(audit_json, '$.score')) AS score
     FROM seo_audits
     WHERE user_id = ?
     ORDER BY checked_at DESC
     LIMIT 50`,
    [userId]
  );
  return rows;
}
 
async function getSeoAuditById(id, userId) {
  const [rows] = await pool.query('SELECT * FROM seo_audits WHERE id = ? AND user_id = ?', [id, userId]);
  if (!rows[0]) return null;
  const row = rows[0];
  const audit = typeof row.audit_json === 'string' ? JSON.parse(row.audit_json) : row.audit_json;
  return { ...audit, id: row.id };
}
 
async function deleteSeoAudit(id, userId) {
  const [result] = await pool.query('DELETE FROM seo_audits WHERE id = ? AND user_id = ?', [id, userId]);
  return result.affectedRows > 0;
}

module.exports = {
  pool, saveReport, getRecentReports, getReportById, deleteReport, createUser, getUserByEmail, getUserById,
  createScheduledCheck, getScheduledChecksByUser, deleteScheduledCheck, getDueScheduledChecks, markScheduledCheckRun,
  createNotification, getNotificationsByUser, markNotificationRead, getPreviousReport, deleteOldReports,
  saveSeoAudit, getRecentSeoAudits, getSeoAuditById, deleteSeoAudit,
};