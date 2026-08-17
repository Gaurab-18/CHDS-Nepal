import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import https from 'https';
import fs from 'fs';
import pinoHttp from 'pino-http';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

import logger from './logger';
import { rateLimiter } from './rateLimiter';
import { query } from './db';
import { UPLOAD_DIR } from './middleware/fileUpload';
import authRoutes from './routes/auth';
import patientRoutes from './routes/patient';
import doctorRoutes from './routes/doctor';
import adminRoutes from './routes/admin';
import notificationRoutes from './routes/notifications';
import fhirRoutes from './routes/fhir';
import hospitalIngestRouter from './routes/hospitalIngest';
import hospitalTermsRouter from './routes/hospitalTerms';
import adminHospitalsRouter from './routes/adminHospitals';
import { hospitalAuth } from './middleware/hospitalAuth';
import { ipBlocker } from './middleware/ipBlocker';
import { authenticate } from './middleware/authorize';
import { startPendingBundleExpiry } from './hospital/maintenance';

dotenv.config();

// Expire stale pending review bundles (PHI lifecycle management)
startPendingBundleExpiry();

const app = express();
const port = process.env.PORT || 4000;

app.use(pinoHttp({ logger } as any));

// Setup security headers
app.use(helmet({
  hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  referrerPolicy: { policy: 'no-referrer' },
  crossOriginEmbedderPolicy: false,
}));

// Explicit security headers: clickjacking, MIME sniffing, permissions
app.use((_req: Request, res: Response, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=()');
  next();
});

// Setup CORS (explicit allowlist, never wildcard, never reflect)
const allowedOrigins = (process.env.CORS_ORIGINS || 'https://localhost')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // non-browser / curl
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true
}));

// Parse JSON request bodies
app.use(express.json());

// Parse cookies for JWT authentication
app.use(cookieParser());

// Serve uploaded files (certificates, etc.) : AUTH-GATED so uploaded PHI and
// certificates are not publicly fetchable by UUID. Any logged-in user may view
// (patients need doctor certificates during consent); anonymous requests 401.
app.use('/api/v1/uploads', authenticate, express.static(UPLOAD_DIR));

// Apply IP blocker (brute force protection) : runs before rate limiter
app.use(ipBlocker);

// Apply rate limiting to all requests
app.use(rateLimiter);

// Auth routes (public)
app.use('/api/v1/auth', authRoutes);

// Patient routes
app.use('/api/v1/patient', patientRoutes);

// Doctor routes
app.use('/api/v1/doctor', doctorRoutes);

// Admin routes
app.use('/api/v1/admin', adminRoutes);

// Universal notification routes (any authenticated user)
app.use('/api/v1/notifications', notificationRoutes);

// Hospital terms route (relaxed auth : any status hospital can read/accept terms)
app.use('/api/v1/hospital', hospitalTermsRouter);

// Hospital ingest routes (strict auth : only active hospitals)
app.use('/api/v1/hospital', hospitalAuth, hospitalIngestRouter);

// Admin hospital management routes
app.use('/api/v1/admin/hospitals', adminHospitalsRouter);

// FHIR routes
app.use('/api/v1/fhir', fhirRoutes);

// Public audit log view (via QR code token - read-only, time-limited)
app.get('/api/v1/public/audit-log', async (req: Request, res: Response) => {
  try {
    const token = req.query.token as string;
    if (!token) {
      res.status(400).json({ error: 'Token is required' });
      return;
    }
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) throw new Error('JWT_SECRET environment variable is not set');
    const decoded = jwt.verify(token, jwtSecret, { issuer: 'chds-nepal' }) as any;
    if (decoded.scope !== 'audit_view') {
      res.status(403).json({ error: 'Invalid token scope' });
      return;
    }
    const userId = decoded.sub;
    const fromDate = (req.query.fromDate as string) || (decoded.fromDate as string);
    const toDate = (req.query.toDate as string) || (decoded.toDate as string);
    const actionFilter = (req.query.action as string) || (decoded.action as string);

    const userResult = await query('SELECT id, username, email FROM users WHERE id = $1', [userId]);
    if (!userResult.rows.length) { res.status(404).json({ error: 'User not found' }); return; }
    const user = userResult.rows[0];
    const patientResult = await query('SELECT id FROM patients WHERE user_id = $1', [userId]);
    const patientId = patientResult.rows[0]?.id;

    const escapeHtml = (s: string): string => {
      return String(s)
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, '&' + '#' + '39' + ';');
    };

    let sql = `SELECT a.timestamp, a.action, a.ip_address, a.override_reason,
                      u.username, u.email, u.role as actor_role
               FROM audit_log a
               LEFT JOIN users u ON a.actor_id = u.id
               WHERE (a.actor_id = $1 OR a.target_id = $1`;
    const params: any[] = [userId];
    if (patientId) { sql += ` OR a.target_id = $2`; params.push(patientId); }
    sql += `)`;
    let paramIdx = params.length + 1;

    if (fromDate) {
      sql += ` AND a.timestamp >= $${paramIdx++}`;
      params.push(fromDate);
    }
    if (toDate) {
      sql += ` AND a.timestamp <= $${paramIdx++}`;
      params.push(toDate);
    } else if (!fromDate) {
      sql += ` AND a.timestamp > CURRENT_TIMESTAMP - INTERVAL '30 days'`;
    }
    if (actionFilter) {
      sql += ` AND a.action ILIKE $${paramIdx++}`;
      params.push(`%${actionFilter}%`);
    }
    sql += ` ORDER BY a.timestamp DESC LIMIT 200`;

    const result = await query(sql, params);
    const entries = result.rows;

    const actionColors: Record<string, string> = {
      LOGIN_SUCCESS: '#10b981',
      LOGIN_FAILED: '#ef4444',
      LOGIN_2FA_REQUIRED: '#f59e0b',
      LOGIN_2FA_SUCCESS: '#10b981',
      LOGIN_2FA_FAILED: '#ef4444',
      LOGOUT: '#6b7280',
      PASSWORD_CHANGED: '#f59e0b',
      PASSWORD_RESET_REQUESTED: '#f59e0b',
      PASSWORD_RESET_COMPLETED: '#10b981',
      '2FA_ENABLED': '#10b981',
      '2FA_BACKUP_USED': '#f59e0b',
      CONSENT_GRANTED: '#10b981',
      CONSENT_REVOKED: '#ef4444',
      WIPE_REQUESTED: '#ef4444',
    };
    const actionLabels: Record<string, string> = {
      LOGIN_SUCCESS: 'Login',
      LOGIN_FAILED: 'Failed Login',
      LOGIN_2FA_REQUIRED: '2FA Required',
      LOGIN_2FA_SUCCESS: '2FA Login',
      LOGIN_2FA_FAILED: 'Failed 2FA',
      LOGOUT: 'Logout',
      PASSWORD_CHANGED: 'Password Changed',
      PASSWORD_RESET_REQUESTED: 'Reset Requested',
      PASSWORD_RESET_COMPLETED: 'Reset Completed',
      '2FA_ENABLED': '2FA Enabled',
      '2FA_BACKUP_USED': 'Backup Code Used',
      CONSENT_GRANTED: 'Consent Granted',
      CONSENT_REVOKED: 'Consent Revoked',
      WIPE_REQUESTED: 'Data Wipe Requested',
    };

    const groups: Record<string, any[]> = {};
    for (const e of entries) {
      const cat = e.action.startsWith('LOGIN') ? 'Authentication' :
        e.action.startsWith('PASSWORD') || e.action.startsWith('2FA') ? 'Security' :
        e.action.startsWith('CONSENT') ? 'Consents' :
        e.action.startsWith('WIPE') ? 'Data Wipe' : 'Other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(e);
    }

    const rows = entries.map((e: any) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${actionColors[e.action] || '#6b7280'};margin-right:6px"></span>
          ${escapeHtml(actionLabels[e.action] || e.action)}
        </td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280">${escapeHtml(e.actor_role || 'system')}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280">${escapeHtml(e.ip_address || '-')}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;white-space:nowrap">${escapeHtml(new Date(e.timestamp).toLocaleString())}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#9ca3af">${escapeHtml(e.override_reason || '')}</td>
      </tr>
    `).join('');

    const groupSummary = Object.entries(groups).map(([cat, items]) =>
      `<div style="margin-bottom:4px"><span style="font-weight:600;font-size:13px">${escapeHtml(cat)}</span><span style="float:right;color:#6b7280;font-size:13px">${items.length} entries</span></div>`
    ).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CHDS Audit Receipt</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#f9fafb; color:#111827; padding:20px; }
    .receipt { max-width:900px; margin:0 auto; background:#fff; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,.1); overflow:hidden; }
    .header { background:linear-gradient(135deg,#059669,#10b981); color:#fff; padding:24px 28px; }
    .header h1 { font-size:20px; font-weight:700; }
    .header p { font-size:13px; opacity:.85; margin-top:4px; }
    .badge { display:inline-block; background:rgba(255,255,255,.2); padding:2px 10px; border-radius:999px; font-size:11px; margin-top:6px; }
    .meta { padding:16px 28px; background:#f3f4f6; border-bottom:1px solid #e5e7eb; font-size:13px; color:#4b5563; }
    .meta strong { color:#111827; }
    .summary { padding:16px 28px; border-bottom:1px solid #e5e7eb; }
    .summary h3 { font-size:13px; font-weight:600; margin-bottom:8px; color:#6b7280; text-transform:uppercase; letter-spacing:.5px; }
    table { width:100%; border-collapse:collapse; }
    th { text-align:left; padding:8px 10px; font-size:11px; font-weight:600; color:#6b7280; text-transform:uppercase; letter-spacing:.5px; border-bottom:2px solid #e5e7eb; }
    td { vertical-align:middle; }
    .footer { padding:16px 28px; text-align:center; font-size:11px; color:#9ca3af; border-top:1px solid #e5e7eb; }
    .no-entries { padding:40px; text-align:center; color:#9ca3af; font-size:14px; }
    @media print {
      body { background:#fff; padding:0; }
      .receipt { box-shadow:none; border-radius:0; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <h1>CHDS Audit Receipt</h1>
      <p>Secure audit log export &middot; ${escapeHtml(user.username || user.email)}</p>
      <span class="badge">${entries.length} entries &middot; ${escapeHtml(fromDate || 'Last 30 days')}${toDate ? ' to ' + escapeHtml(toDate) : ''}${actionFilter ? ' &middot; Filter: ' + escapeHtml(actionFilter) : ''}</span>
    </div>
    <div class="meta">
      <strong>User:</strong> ${escapeHtml(user.username || 'N/A')} (${escapeHtml(user.email)})<br>
      <strong>Generated:</strong> ${new Date().toLocaleString()} &middot; <strong>Expires:</strong> ${new Date(Date.now() + 86400000).toLocaleString()}
    </div>
    ${entries.length === 0 ? '<div class="no-entries">No audit entries found for the selected criteria.</div>' : `
    <div class="summary">
      <h3>Summary</h3>
      ${groupSummary}
    </div>
    <table>
      <thead>
        <tr>
          <th>Action</th>
          <th>Actor</th>
          <th>IP</th>
          <th>Timestamp</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    `}
    <div class="footer">
      CHDS Nepal &middot; HIPAA-compliant audit trail &middot; Receipt valid for 24 hours
    </div>
  </div>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err: any) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    logger.error({ err }, 'Public audit log error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health Check Endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/v1/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// A placeholder api/v1 route
app.get('/api/v1', (_req: Request, res: Response) => {
  res.status(200).json({ message: 'Welcome to CHDS Nepal HTTPS API' });
});

// Global error handler for file upload and other errors
app.use((err: any, _req: Request, res: Response, _next: any) => {
  if (err.message && (err.message.includes('extension') || err.message.includes('not allowed') || err.message.includes('not in the allowed'))) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'File too large. Maximum size is 10MB.' });
    return;
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    res.status(400).json({ error: 'Only one file can be uploaded at a time.' });
    return;
  }
  // Malformed JSON body → 400, not a 500 crash
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'Invalid JSON in request body' });
    return;
  }
  // Request body exceeds the JSON limit → 413, not a 500 crash
  if (err.type === 'entity.too.large') {
    res.status(413).json({ error: 'Request body too large' });
    return;
  }
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

// Start Server (HTTPS preferred, HTTP fallback)
const sslKeyPath = process.env.SSL_KEY_PATH || '/etc/ssl/certs/server.key';
const sslCertPath = process.env.SSL_CERT_PATH || '/etc/ssl/certs/server.crt';

try {
  const options = {
    key: fs.readFileSync(sslKeyPath),
    cert: fs.readFileSync(sslCertPath)
  };

  https.createServer(options, app).listen(port, () => {
    logger.info(`[server]: Secure HTTPS Server running at https://localhost:${port}`);
  });
} catch (error) {
  logger.warn({ error }, 'SSL certs not found, falling back to HTTP');
  http.createServer(app).listen(port, () => {
    logger.info(`[server]: HTTP Server running at http://localhost:${port}`);
  });
}
