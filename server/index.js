const express = require('express');
const cors = require('cors');
require('dotenv').config()

const { normalizeUrl } = require('./checks');
const { checkQueue } = require('./queue');
const {
  getRecentReports, getReportById, deleteReport, createUser, getUserByEmail, getUserById,
  createScheduledCheck, getScheduledChecksByUser, deleteScheduledCheck,
  getNotificationsByUser, markNotificationRead,
  getRecentSeoAudits, getSeoAuditById, deleteSeoAudit,
} = require('./db');

const { generatePdf } = require('./pdf');
const { generateSeoAuditPdf } = require('./seo-audit-pdf');
const { hashPassword, verifyPassword, signToken, authMiddleware, optionalAuthMiddleware } = require('./auth');
const { checkRateLimiter } = require('./rate-limit');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }

    const passwordHash = await hashPassword(password);
    const user = await createUser(email, passwordHash);
    const token = signToken(user);

    res.status(201).json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to register' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user);
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

app.post('/api/check', optionalAuthMiddleware, checkRateLimiter, async (req, res) => {
  const normalizedUrl = normalizeUrl(req.body.url);
  if (!normalizedUrl) {
    return res.status(400).json({ error: 'Please provide a valid URL' });
  }

  let maxPages = null;
  if (req.body.maxPages !== undefined && req.body.maxPages !== null && req.body.maxPages !== '') {
    const parsed = parseInt(req.body.maxPages, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      return res.status(400).json({ error: 'maxPages must be a whole number between 1 and 100' });
    }
    maxPages = parsed;
  }

  const job = await checkQueue.add('check-site', { url: normalizedUrl, userId: req.userId, maxPages });
  res.status(202).json({ jobId: job.id, status: 'queued' });
});

app.get('/api/check/:jobId', optionalAuthMiddleware, async (req, res) => {
  const job = await checkQueue.getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.data.userId && job.data.userId !== req.userId) {
    return res.status(403).json({ error: 'Not your job' });
  }

  const state = await job.getState();

  if (state === 'completed') {
    return res.json({ status: 'completed', report: job.returnvalue });
  }
  if (state === 'failed') {
    return res.json({ status: 'failed', error: job.failedReason });
  }
  return res.json({ status: state });
});

app.get('/api/reports', authMiddleware, async (req, res) => {
  try {
    const reports = await getRecentReports(req.userId);
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

app.get('/api/reports/:id', authMiddleware, async (req, res) => {
  try {
    const report = await getReportById(req.params.id, req.userId);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

app.delete('/api/reports/:id', authMiddleware, async (req, res) => {
  try {
    const deleted = await deleteReport(req.params.id, req.userId);
    if (!deleted) return res.status(404).json({ error: 'Report not found' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete report' });
  }
});

app.get('/api/reports/:id/pdf', authMiddleware, async (req, res) => {
  try {
    const report = await getReportById(req.params.id, req.userId);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const user = await getUserById(req.userId);
    const pdfBuffer = await generatePdf(report, user?.email);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="report-${req.params.id}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

app.post('/api/scheduled-checks', authMiddleware, async (req, res) => {
  try {
    const { url, intervalType } = req.body;
    if (!url || !['daily', 'weekly'].includes(intervalType)) {
      return res.status(400).json({ error: 'A valid url and intervalType (daily/weekly) are required' });
    }
    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl) return res.status(400).json({ error: 'Please provide a valid URL' });

    const id = await createScheduledCheck(req.userId, normalizedUrl, intervalType);
    res.status(201).json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create scheduled check' });
  }
});

app.get('/api/scheduled-checks', authMiddleware, async (req, res) => {
  try {
    const checks = await getScheduledChecksByUser(req.userId);
    res.json(checks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch scheduled checks' });
  }
});

app.delete('/api/scheduled-checks/:id', authMiddleware, async (req, res) => {
  try {
    const deleted = await deleteScheduledCheck(req.params.id, req.userId);
    if (!deleted) return res.status(404).json({ error: 'Scheduled check not found' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete scheduled check' });
  }
});

app.get('/api/notifications', authMiddleware, async (req, res) => {
  try {
    const notifications = await getNotificationsByUser(req.userId);
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

app.post('/api/notifications/:id/read', authMiddleware, async (req, res) => {
  try {
    const updated = await markNotificationRead(req.params.id, req.userId);
    if (!updated) return res.status(404).json({ error: 'Notification not found' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

app.delete('/api/check/:jobId', async (req, res) => {
  const { jobId } = req.params;
  try {
    const job = await checkQueue.getJob(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const state = await job.getState();

    if (state === 'waiting' || state === 'delayed') {
      await job.remove();
    } else {
      await job.updateData({ ...job.data, cancelled: true });
    }

    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel scan' });
  }
});

app.post('/api/seo-audit', optionalAuthMiddleware, checkRateLimiter, async (req, res) => {
  const normalizedUrl = normalizeUrl(req.body.url);
  if (!normalizedUrl) {
    return res.status(400).json({ error: 'Please provide a valid URL' });
  }

  let maxPages = null;
  if (req.body.maxPages !== undefined && req.body.maxPages !== null && req.body.maxPages !== '') {
    const parsed = parseInt(req.body.maxPages, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      return res.status(400).json({ error: 'maxPages must be a whole number between 1 and 100' });
    }
    maxPages = parsed;
  }

  const job = await checkQueue.add('seo-audit', {
    url: normalizedUrl,
    userId: req.userId,
    auditType: 'seo',
    maxPages,
  });
  res.status(202).json({ jobId: job.id, status: 'queued' });
});
 
app.get('/api/seo-reports', authMiddleware, async (req, res) => {
  try {
    const audits = await getRecentSeoAudits(req.userId);
    res.json(audits);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch SEO audits' });
  }
});
 
app.get('/api/seo-reports/:id', authMiddleware, async (req, res) => {
  try {
    const audit = await getSeoAuditById(req.params.id, req.userId);
    if (!audit) return res.status(404).json({ error: 'SEO audit not found' });
    res.json(audit);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch SEO audit' });
  }
});
 
app.delete('/api/seo-reports/:id', authMiddleware, async (req, res) => {
  try {
    const deleted = await deleteSeoAudit(req.params.id, req.userId);
    if (!deleted) return res.status(404).json({ error: 'SEO audit not found' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete SEO audit' });
  }
});

app.get('/api/seo-reports/:id/pdf', authMiddleware, async (req, res) => {
  try {
    const audit = await getSeoAuditById(req.params.id, req.userId);
    if (!audit) return res.status(404).json({ error: 'SEO audit not found' });

    const user = await getUserById(req.userId);
    const pdfBuffer = await generateSeoAuditPdf(audit, user?.email);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="seo-audit-${req.params.id}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate SEO audit PDF' });
  }
});

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});