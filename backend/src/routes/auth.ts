import { Router, Request, Response } from 'express';
import { query } from '../db';
import crypto from 'crypto';
import { hashPassword, verifyPassword } from '../auth/password';
import {
  generateAccessToken,
  generateRefreshToken,
  setAuthCookies,
  clearAuthCookies,
  verifyRefreshToken,
  getRefreshTokenFromCookies,
  generateResetToken,
  hashToken
} from '../auth/jwt';
import { verifyTOTPForUser, setupTOTP, enableTOTP } from '../auth/totp';
import { insertAuditLog } from '../middleware/auditLogger';
import { authenticate, JwtPayload } from '../middleware/authorize';
import redisClient from '../redisClient';
import { sendPasswordResetEmail } from '../email';
import { blockIP } from '../middleware/ipBlocker';
import logger from '../logger';

const router = Router();

const REQUIRES_2FA_RESPONSE = { requires2FA: true, message: '2FA verification required' };

// --- LOGIN ---
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const result = await query(
      'SELECT id, email, username, password_hash, role, two_factor_enabled, onboarding_complete, token_version, must_change_password, is_verified FROM users WHERE email = $1',
      [email]
    );

    if (!result.rows.length) {
      await insertAuditLog(null, 'LOGIN_FAILED', null, req.ip || 'unknown', req.get('User-Agent') || 'unknown');
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = result.rows[0];
    const isValidPassword = await verifyPassword(password, user.password_hash, user.id);

    if (!isValidPassword) {
      await insertAuditLog(user.id, 'LOGIN_FAILED', null, req.ip || 'unknown', req.get('User-Agent') || 'unknown');
      const redisKey = `failed_logins:${user.id}`;
      const count = await redisClient.incr(redisKey);
      const failedLoginTtl = parseInt(process.env.FAILED_LOGIN_TTL || '3600');
      const breachThreshold = parseInt(process.env.BREACH_THRESHOLD || '7');
      const rapidFireThreshold = parseInt(process.env.RAPID_FIRE_THRESHOLD || '5');
      if (count === 1) await redisClient.expire(redisKey, failedLoginTtl);

      // Rapid-fire detection: 5+ attempts in 60 seconds → immediate block
      const clientIP = req.headers['x-forwarded-for']
        ? (typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : req.headers['x-forwarded-for'][0]).split(',')[0].trim()
        : req.ip || req.socket.remoteAddress || 'unknown';
      const rapidKey = `failed_logins_rapid:${clientIP}`;
      const rapidCount = await redisClient.incr(rapidKey);
      if (rapidCount === 1) await redisClient.expire(rapidKey, 60);
      const isRapidFire = rapidCount >= rapidFireThreshold;

      const shouldBlock = count >= breachThreshold || isRapidFire;
      const remainingAttempts = Math.max(0, breachThreshold - count);

      if (shouldBlock) {
        if (user.must_change_password === false) {
          await query('UPDATE users SET must_change_password = true WHERE id = $1', [user.id]);
        }
        const blockId = await blockIP(clientIP, isRapidFire ? 'SUSPICIOUS_ACTIVITY' : 'BRUTE_FORCE', null, user.id, count);
        if (blockId) {
          logger.warn({ userId: user.id, ip: clientIP, blockId, rapidFire: isRapidFire }, 'IP blocked');
        }
        await insertAuditLog(user.id, 'BREACH_DETECTED', null, req.ip || 'unknown', req.get('User-Agent') || 'unknown');
        await insertAuditLog(user.id, 'IP_BLOCKED', blockId, req.ip || 'unknown', req.get('User-Agent') || 'unknown');
      }

      const response: any = { error: 'Invalid credentials' };
      if (!shouldBlock && remainingAttempts <= 3 && remainingAttempts > 0) {
        response.warning = `You have ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining before your IP is temporarily blocked.`;
      }
      res.status(401).json(response);
      return;
    }

    if (user.two_factor_enabled) {
      await insertAuditLog(user.id, 'LOGIN_2FA_REQUIRED', null, req.ip || 'unknown', req.get('User-Agent') || 'unknown');
      res.status(200).json(REQUIRES_2FA_RESPONSE);
      return;
    }

    const payload: JwtPayload & { token_version: number } = {
      id: user.id, email: user.email, role: user.role, token_version: user.token_version, is_verified: user.is_verified
    };
    setAuthCookies(res, generateAccessToken(payload), generateRefreshToken(payload));

    await redisClient.del(`failed_logins:${user.id}`);
    await query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
    await insertAuditLog(user.id, 'LOGIN_SUCCESS', null, req.ip || 'unknown', req.get('User-Agent') || 'unknown');

    res.status(200).json({
      message: 'Login successful',
      user: { id: user.id, email: user.email, username: user.username, role: user.role, two_factor_enabled: user.two_factor_enabled, onboarding_complete: user.onboarding_complete },
      must_change_password: user.must_change_password,
    });
  } catch (err) {
    logger.error({ err }, 'Login error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- LOGIN 2FA ---
router.post('/login/2fa', async (req: Request, res: Response) => {
  try {
    const { email, password, token } = req.body;
    if (!email || !password || !token) {
      res.status(400).json({ error: 'Email, password, and token are required' });
      return;
    }

    const result = await query(
      'SELECT id, email, username, password_hash, role, two_factor_enabled, onboarding_complete, token_version, must_change_password, is_verified FROM users WHERE email = $1',
      [email]
    );

    if (!result.rows.length) { res.status(401).json({ error: 'Invalid credentials' }); return; }

    const user = result.rows[0];
    const isValidPassword = await verifyPassword(password, user.password_hash, user.id);
    if (!isValidPassword) {
      await insertAuditLog(user.id, 'LOGIN_2FA_FAILED', null, req.ip || 'unknown', req.get('User-Agent') || 'unknown');
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (!user.two_factor_enabled) { res.status(400).json({ error: '2FA not enabled' }); return; }

    const isValidToken = await verifyTOTPForUser(user.id, token);
    if (!isValidToken) {
      await insertAuditLog(user.id, 'LOGIN_2FA_FAILED', null, req.ip || 'unknown', req.get('User-Agent') || 'unknown');
      res.status(401).json({ error: 'Invalid 2FA token' });
      return;
    }

    const payload: JwtPayload & { token_version: number } = {
      id: user.id, email: user.email, role: user.role, token_version: user.token_version, is_verified: user.is_verified
    };
    setAuthCookies(res, generateAccessToken(payload), generateRefreshToken(payload));

    await query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
    await insertAuditLog(user.id, 'LOGIN_2FA_SUCCESS', null, req.ip || 'unknown', req.get('User-Agent') || 'unknown');

    res.status(200).json({
      message: 'Login successful',
      user: { id: user.id, email: user.email, username: user.username, role: user.role, two_factor_enabled: user.two_factor_enabled, onboarding_complete: user.onboarding_complete },
      must_change_password: user.must_change_password,
    });
  } catch (err) {
    logger.error({ err }, '2FA login error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- REGISTER (patient only) ---
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, email, password, role } = req.body;
    if (!username || !email || !password) {
      res.status(400).json({ error: 'Username, email, and password are required' });
      return;
    }

    const userRole = role === 'doctor' ? 'doctor' : 'patient';

    const existingUser = await query('SELECT id FROM users WHERE email = $1 OR username = $2', [email, username]);
    if (existingUser.rows.length) {
      res.status(409).json({ error: 'User with this email or username already exists' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const result = await query(
      `INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role`,
      [username, email, passwordHash, userRole]
    );
    const user = result.rows[0];

    if (userRole === 'doctor') {
      const fullName = req.body.full_name || username;
      const hospitalName = req.body.hospital_name || 'Not specified';
      await query(
        `INSERT INTO doctor_profiles (user_id, full_name, hospital_name) VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name, hospital_name = EXCLUDED.hospital_name`,
        [user.id, fullName, hospitalName]
      );
    }

    await insertAuditLog(user.id, 'USER_REGISTERED', user.id, req.ip || 'unknown', req.get('User-Agent') || 'unknown');
    res.status(201).json({ message: 'User registered successfully', user: { id: user.id, username: user.username, email: user.email, role: user.role } });
  } catch (err) {
    logger.error({ err }, 'Registration error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- LOGOUT ---
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  try {
    await insertAuditLog(req.user!.id, 'LOGOUT', null, req.ip || 'unknown', req.get('User-Agent') || 'unknown');
    clearAuthCookies(res);
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    logger.error({ err }, 'Logout error');
    clearAuthCookies(res);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- REFRESH ---
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const refreshToken = getRefreshTokenFromCookies(req);
    if (!refreshToken) { res.status(401).json({ error: 'Refresh token required' }); return; }
    const payload = verifyRefreshToken(refreshToken);
    const result = await query('SELECT id, email, role, token_version, is_verified, onboarding_complete FROM users WHERE id = $1', [payload.id]);
    if (!result.rows.length) { res.status(401).json({ error: 'User not found' }); return; }
    const user = result.rows[0];
    setAuthCookies(res, generateAccessToken(user), generateRefreshToken(user));
    res.status(200).json({ message: 'Token refreshed successfully' });
  } catch (err) {
    logger.error({ err }, 'Token refresh error');
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// --- 2FA SETUP ---
router.post('/2fa/setup', authenticate, async (req: Request, res: Response) => {
  try {
    const { secret, qrCode } = await setupTOTP(req.user!.id, req.user!.email);
    res.status(200).json({ message: '2FA setup initiated', secret, qrCode });
  } catch (err) {
    logger.error({ err }, '2FA setup error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- 2FA ENABLE (with backup codes) ---
router.post('/2fa/enable', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { token } = req.body;
    if (!token) { res.status(400).json({ error: 'Token is required' }); return; }

    const success = await enableTOTP(userId, token);
    if (!success) { res.status(400).json({ error: 'Invalid 2FA token' }); return; }

    const backupCodes: string[] = [];
    const insertValues: { code_hash: string; user_id: string }[] = [];
    for (let i = 0; i < 8; i++) {
      const code = crypto.randomBytes(4).toString('hex');
      backupCodes.push(code);
      insertValues.push({ user_id: userId, code_hash: hashToken(code) });
    }
    for (const v of insertValues) {
      await query('INSERT INTO two_factor_backup_codes (user_id, code_hash) VALUES ($1, $2)', [v.user_id, v.code_hash]);
    }

    await insertAuditLog(userId, '2FA_ENABLED', null, req.ip || 'unknown', req.get('User-Agent') || 'unknown');

    res.status(200).json({ message: '2FA enabled successfully', backup_codes: backupCodes });
  } catch (err) {
    logger.error({ err }, '2FA enable error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- 2FA DISABLE ---
router.post('/2fa/disable', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    await query(
      'UPDATE users SET two_factor_secret = NULL, two_factor_enabled = false WHERE id = $1',
      [userId]
    );
    await query('DELETE FROM two_factor_backup_codes WHERE user_id = $1', [userId]);
    await insertAuditLog(userId, '2FA_DISABLED', null, req.ip || 'unknown', req.get('User-Agent') || 'unknown');
    res.status(200).json({ message: '2FA disabled successfully' });
  } catch (err) {
    logger.error({ err }, '2FA disable error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- VERIFY BACKUP CODE ---
router.post('/verify-backup-code', async (req: Request, res: Response) => {
  try {
    const { email, password, code } = req.body;
    if (!email || !password || !code) {
      res.status(400).json({ error: 'Email, password, and code are required' });
      return;
    }

    const result = await query('SELECT id, email, password_hash, role, two_factor_enabled, onboarding_complete, token_version, is_verified FROM users WHERE email = $1', [email]);
    if (!result.rows.length) { res.status(401).json({ error: 'Invalid credentials' }); return; }

    const user = result.rows[0];
    const isValidPassword = await verifyPassword(password, user.password_hash, user.id);
    if (!isValidPassword) { res.status(401).json({ error: 'Invalid credentials' }); return; }

    const codeHash = hashToken(code);
    const bcResult = await query(
      'SELECT id FROM two_factor_backup_codes WHERE user_id = $1 AND code_hash = $2 AND used = false LIMIT 1',
      [user.id, codeHash]
    );
    if (!bcResult.rows.length) { res.status(401).json({ error: 'Invalid or already used backup code' }); return; }

    await query('UPDATE two_factor_backup_codes SET used = true WHERE id = $1', [bcResult.rows[0].id]);

    const payload: JwtPayload & { token_version: number } = { id: user.id, email, role: user.role, token_version: user.token_version, is_verified: user.is_verified };
    setAuthCookies(res, generateAccessToken(payload), generateRefreshToken(payload));

    await insertAuditLog(user.id, '2FA_BACKUP_USED', null, req.ip || 'unknown', req.get('User-Agent') || 'unknown');
    res.status(200).json({ message: 'Login successful', user: { id: user.id, email: user.email, role: user.role, two_factor_enabled: true, onboarding_complete: user.onboarding_complete } });
  } catch (err) {
    logger.error({ err }, 'Backup code error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- FORGOT PASSWORD ---
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) { res.status(400).json({ error: 'Email is required' }); return; }

    const result = await query('SELECT id FROM users WHERE email = $1', [email]);

    if (result.rows.length) {
      const token = generateResetToken();
      const tokenHash = hashToken(token);
      await query(
        'UPDATE users SET reset_token_hash = $1, reset_token_expires = CURRENT_TIMESTAMP + INTERVAL \'1 hour\' WHERE id = $2',
        [tokenHash, result.rows[0].id]
      );
      await insertAuditLog(result.rows[0].id, 'PASSWORD_RESET_REQUESTED', null, req.ip || 'unknown', req.get('User-Agent') || 'unknown');
      try {
        await sendPasswordResetEmail(email, token);
      } catch (mailErr) {
        logger.error({ err: mailErr }, 'Failed to send password reset email');
      }
    }

    res.status(200).json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    logger.error({ err }, 'Forgot password error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- RESET PASSWORD ---
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      res.status(400).json({ error: 'Token and new password are required' });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    const tokenHash = hashToken(token);
    const result = await query(
      'SELECT id FROM users WHERE reset_token_hash = $1 AND reset_token_expires > CURRENT_TIMESTAMP',
      [tokenHash]
    );
    if (!result.rows.length) { res.status(400).json({ error: 'Invalid or expired reset token' }); return; }

    const passwordHash = await hashPassword(newPassword);
    await query(
      'UPDATE users SET password_hash = $1, reset_token_hash = NULL, reset_token_expires = NULL, token_version = token_version + 1 WHERE id = $2',
      [passwordHash, result.rows[0].id]
    );

    await insertAuditLog(result.rows[0].id, 'PASSWORD_RESET_COMPLETED', null, req.ip || 'unknown', req.get('User-Agent') || 'unknown');
    res.status(200).json({ message: 'Password reset successful. Please log in with your new password.' });
  } catch (err) {
    logger.error({ err }, 'Reset password error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- CHANGE PASSWORD ---
router.post('/change-password', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current password and new password are required' });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters' });
      return;
    }

    const result = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    const isValid = await verifyPassword(currentPassword, result.rows[0].password_hash, userId);
    if (!isValid) { res.status(400).json({ error: 'Current password is incorrect' }); return; }

    const passwordHash = await hashPassword(newPassword);
    await query(
      'UPDATE users SET password_hash = $1, must_change_password = false, token_version = token_version + 1 WHERE id = $2',
      [passwordHash, userId]
    );

    clearAuthCookies(res);
    await insertAuditLog(userId, 'PASSWORD_CHANGED', null, req.ip || 'unknown', req.get('User-Agent') || 'unknown');
    res.status(200).json({ message: 'Password changed. Please log in again.' });
  } catch (err) {
    logger.error({ err }, 'Change password error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- ONBOARDING COMPLETE ---
router.post('/onboarding-complete', authenticate, async (req: Request, res: Response) => {
  try {
    await query('UPDATE users SET onboarding_complete = true WHERE id = $1', [req.user!.id]);
    await insertAuditLog(req.user!.id, 'ONBOARDING_COMPLETED', null, req.ip || 'unknown', req.get('User-Agent') || 'unknown');
    res.status(200).json({ message: 'Onboarding completed' });
  } catch (err) {
    logger.error({ err }, 'Onboarding error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- SECURITY SCORE ---
router.get('/security-score', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    let score = 0;

    const userResult = await query(
      'SELECT two_factor_enabled, last_login FROM users WHERE id = $1',
      [userId]
    );
    if (!userResult.rows.length) { res.status(404).json({ error: 'User not found' }); return; }
    const u = userResult.rows[0];

    if (u.two_factor_enabled) score += 40;

    if (u.last_login && (Date.now() - new Date(u.last_login).getTime()) < 30 * 24 * 60 * 60 * 1000) score += 20;

    const failedLogins = await query(
      "SELECT COUNT(*) as cnt FROM audit_log WHERE actor_id = $1 AND action = 'LOGIN_FAILED' AND timestamp > CURRENT_TIMESTAMP - INTERVAL '7 days'",
      [userId]
    );
    if (parseInt(failedLogins.rows[0].cnt) === 0) score += 20;

    const recentConsentReview = await query(
      "SELECT COUNT(*) as cnt FROM audit_log WHERE actor_id = $1 AND action LIKE 'CONSENT_%' AND timestamp > CURRENT_TIMESTAMP - INTERVAL '30 days'",
      [userId]
    );
    if (parseInt(recentConsentReview.rows[0].cnt) > 0) score += 20;

    let label = 'Needs attention';
    if (score >= 80) label = 'Strong';
    else if (score >= 50) label = 'Good';

    res.json({ score, label, breakdown: { twoFactor: u.two_factor_enabled ? 40 : 0, recentLogin: score >= 20 ? 20 : 0, noFailedLogins: parseInt(failedLogins.rows[0].cnt) === 0 ? 20 : 0, recentConsentReview: parseInt(recentConsentReview.rows[0].cnt) > 0 ? 20 : 0 } });
  } catch (err) {
    logger.error({ err }, 'Security score error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- ACCEPT TERMS ---
router.post('/accept-terms', authenticate, async (req: Request, res: Response) => {
  try {
    await query(
      'UPDATE users SET terms_accepted = true, terms_accepted_at = CURRENT_TIMESTAMP WHERE id = $1',
      [req.user!.id]
    );
    res.status(200).json({ message: 'Terms accepted' });
  } catch (err) {
    logger.error({ err }, 'Accept terms error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;