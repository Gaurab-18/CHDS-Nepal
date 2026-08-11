import { Router, Request, Response } from 'express';
import { query } from '../db';
import { authenticate, authorize } from '../middleware/authorize';
import { auditLog, insertAuditLog } from '../middleware/auditLogger';
import { hashPassword, generateTempPassword } from '../auth/password';
import { generateResetToken, hashToken } from '../auth/jwt';
import { sendTempPasswordEmail, sendInviteEmail } from '../email';
import { unblockIP } from '../middleware/ipBlocker';
import logger from '../logger';

const router = Router();

router.get('/users', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const q = req.query.q as string;
    let sql = `SELECT id, username, email, role, two_factor_enabled, active, created_at, updated_at FROM users`;
    const params: any[] = [];
    if (q && q.trim()) {
      sql += ` WHERE id::text ILIKE $1 OR username ILIKE $1 OR email ILIKE $1`;
      params.push(`%${q.trim()}%`);
    }
    sql += ` ORDER BY created_at DESC`;
    const result = await query(sql, params);
    res.status(200).json(result.rows);
  } catch (err) {
    logger.error({ err }, 'List users error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/users', authenticate, authorize('admin'), auditLog('USER_CREATED'),
  async (req: Request, res: Response) => {
    try {
      const { email, username, role } = req.body;

      if (!email || !username || !role) {
        res.status(400).json({ error: 'email, username, and role are required' });
        return;
      }

      if (!['patient', 'doctor', 'admin'].includes(role)) {
        res.status(400).json({ error: 'Invalid role' });
        return;
      }

      const existing = await query('SELECT id FROM users WHERE email = $1 OR username = $2', [email, username]);
      if (existing.rows.length) {
        res.status(409).json({ error: 'User with this email or username already exists' });
        return;
      }

      const tempPassword = generateTempPassword();
      const passwordHash = await hashPassword(tempPassword);

      const result = await query(
        `INSERT INTO users (username, email, password_hash, role, must_change_password)
         VALUES ($1, $2, $3, $4, true) RETURNING id, username, email, role, created_at`,
        [username, email, passwordHash, role]
      );

      try {
        await sendTempPasswordEmail(email, tempPassword);
      } catch (mailErr) {
        logger.error({ err: mailErr }, 'Failed to send temp password email');
      }

      await insertAuditLog(
        req.user!.id, 'USER_CREATED', result.rows[0].id,
        req.ip || 'unknown', req.get('User-Agent') || 'unknown'
      );

      res.status(201).json({
        message: 'User created',
        user: result.rows[0],
        temp_password: tempPassword,
      });
    } catch (err) {
      logger.error({ err }, 'Create user error');
      res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/invite', authenticate, authorize('admin'), auditLog('USER_INVITED'),
  async (req: Request, res: Response) => {
    try {
      const { email, role, hospital_id } = req.body;

      if (!email || !role) {
        res.status(400).json({ error: 'email and role are required' });
        return;
      }

      if (!['doctor', 'admin'].includes(role)) {
        res.status(400).json({ error: 'Can only invite doctor or admin' });
        return;
      }

      const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length) {
        res.status(409).json({ error: 'User with this email already exists' });
        return;
      }

      const inviteToken = generateResetToken();
      const tokenHash = hashToken(inviteToken);

      await query(
        `INSERT INTO users (username, email, password_hash, role, reset_token_hash, reset_token_expires, must_change_password)
         VALUES ($1, $2, 'INVITE_PENDING', $3, $4, CURRENT_TIMESTAMP + INTERVAL '48 hours', true)
         ON CONFLICT (email) DO UPDATE SET
           reset_token_hash = EXCLUDED.reset_token_hash,
           reset_token_expires = EXCLUDED.reset_token_expires`,
        [`invited_${email.split('@')[0]}`, email, role, tokenHash]
      );

      try {
        await sendInviteEmail(email, inviteToken, role, hospital_id);
      } catch (mailErr) {
        logger.error({ err: mailErr }, 'Failed to send invite email');
      }

      res.status(200).json({ message: 'Invitation sent', email, role });
    } catch (err) {
      logger.error({ err }, 'Invite user error');
      res.status(500).json({ error: 'Internal server error' });
    }
});

router.patch('/users/:id', authenticate, authorize('admin'), auditLog('ADMIN_UPDATED_USER'),
  async (req: Request, res: Response) => {
    try {
      const { role } = req.body;

      if (!role || !['patient', 'doctor', 'admin'].includes(role)) {
        res.status(400).json({ error: 'Valid role is required (patient, doctor, admin)' });
        return;
      }

      if (req.params.id === req.user!.id) {
        res.status(400).json({ error: 'Cannot change your own role' });
        return;
      }

      if (role !== 'admin') {
        const adminCount = await query("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'");
        if (parseInt(adminCount.rows[0].cnt) <= 1) {
          res.status(400).json({ error: 'Cannot demote the last admin' });
          return;
        }
      }

      const result = await query(
        `UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 RETURNING id, username, email, role, updated_at`,
        [role, req.params.id]
      );

      if (!result.rows.length) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.status(200).json({ message: 'User role updated', user: result.rows[0] });
    } catch (err) {
      logger.error({ err }, 'Update user error');
      res.status(500).json({ error: 'Internal server error' });
    }
});

router.patch('/users/:id/disable', authenticate, authorize('admin'), auditLog('USER_DISABLED'),
  async (req: Request, res: Response) => {
    try {
      if (req.params.id === req.user!.id) {
        res.status(400).json({ error: 'Cannot disable your own account' });
        return;
      }

      const userResult = await query('SELECT active FROM users WHERE id = $1', [req.params.id]);
      if (!userResult.rows.length) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const newActive = !userResult.rows[0].active;
      await query('UPDATE users SET active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newActive, req.params.id]);

      await insertAuditLog(
        req.user!.id, newActive ? 'USER_ENABLED' : 'USER_DISABLED', req.params.id,
        req.ip || 'unknown', req.get('User-Agent') || 'unknown'
      );

      res.status(200).json({ message: newActive ? 'User enabled' : 'User disabled', active: newActive });
    } catch (err) {
      logger.error({ err }, 'Toggle user active error');
      res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/users/:id', authenticate, authorize('admin'), auditLog('USER_DELETED'),
  async (req: Request, res: Response) => {
    try {
      if (req.params.id === req.user!.id) {
        res.status(400).json({ error: 'Cannot delete your own account' });
        return;
      }

      const userResult = await query('SELECT id, role FROM users WHERE id = $1', [req.params.id]);
      if (!userResult.rows.length) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const targetUser = userResult.rows[0];

      if (targetUser.role === 'admin') {
        const adminCount = await query("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'");
        if (parseInt(adminCount.rows[0].cnt) <= 1) {
          res.status(400).json({ error: 'Cannot delete the last admin' });
          return;
        }
      }

      await query('DELETE FROM notifications WHERE user_id = $1', [req.params.id]);
      await query('DELETE FROM two_factor_backup_codes WHERE user_id = $1', [req.params.id]);

      if (targetUser.role === 'patient') {
        const patientResult = await query('SELECT id FROM patients WHERE user_id = $1', [req.params.id]);
        if (patientResult.rows.length) {
          const pid = patientResult.rows[0].id;
          await query('DELETE FROM consents WHERE patient_id = $1', [pid]);
          await query('DELETE FROM records WHERE patient_id = $1', [pid]);
          await query('DELETE FROM data_wipe_requests WHERE patient_id = $1', [pid]);
          await query('DELETE FROM patients WHERE id = $1', [pid]);
        }
      }

      await query('DELETE FROM users WHERE id = $1', [req.params.id]);

      await insertAuditLog(req.user!.id, 'USER_DELETED', req.params.id,
        req.ip || 'unknown', req.get('User-Agent') || 'unknown');

      res.status(200).json({ message: 'User permanently deleted' });
    } catch (err) {
      logger.error({ err }, 'Delete user error');
      res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/users/:id/reset-password', authenticate, authorize('admin'), auditLog('USER_PASSWORD_RESET_BY_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const userResult = await query('SELECT id, email FROM users WHERE id = $1', [req.params.id]);
      if (!userResult.rows.length) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const tempPassword = generateTempPassword();
      const passwordHash = await hashPassword(tempPassword);

      await query(
        `UPDATE users SET password_hash = $1, must_change_password = true, token_version = token_version + 1,
         two_factor_secret = NULL, two_factor_enabled = false, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [passwordHash, req.params.id]
      );

      await query('DELETE FROM two_factor_backup_codes WHERE user_id = $1', [req.params.id]);

      try {
        await sendTempPasswordEmail(userResult.rows[0].email, tempPassword);
      } catch (mailErr) {
        logger.error({ err: mailErr }, 'Failed to send reset email');
      }

      await query(
        `INSERT INTO notifications (user_id, type, title, message) VALUES ($1, 'password_reset', 'Password Reset by Admin',
         'Your password was reset by an administrator. Check your email for the temporary password.')`,
        [req.params.id]
      );

      await insertAuditLog(req.user!.id, 'USER_PASSWORD_RESET_BY_ADMIN', req.params.id,
        req.ip || 'unknown', req.get('User-Agent') || 'unknown');

      res.status(200).json({
        message: 'Password reset successful. User notified via email.',
        temp_password: tempPassword,
      });
    } catch (err) {
      logger.error({ err }, 'Admin reset password error');
      res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/notices', authenticate, authorize('admin'), auditLog('NOTICE_CREATED'),
  async (req: Request, res: Response) => {
    try {
      const { title, message, target_role } = req.body;

      if (!title || !message || !target_role) {
        res.status(400).json({ error: 'title, message, and target_role are required' });
        return;
      }

      if (!['patient', 'doctor', 'admin', 'all'].includes(target_role)) {
        res.status(400).json({ error: 'target_role must be patient, doctor, admin, or all' });
        return;
      }

      const noticeResult = await query(
        `INSERT INTO admin_notices (title, message, target_role, created_by)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [title, message, target_role, req.user!.id]
      );

      let userSql = 'SELECT id FROM users';
      const userParams: any[] = [];
      if (target_role !== 'all') {
        userSql += ' WHERE role = $1';
        userParams.push(target_role);
      }
      const usersResult = await query(userSql, userParams);

      for (const u of usersResult.rows) {
        await query(
          `INSERT INTO notifications (user_id, type, link, title, message) VALUES ($1, 'admin_notice', '/notices', $2, $3)`,
          [u.id, title, message]
        );
      }

      await insertAuditLog(req.user!.id, 'NOTICE_CREATED', noticeResult.rows[0].id,
        req.ip || 'unknown', req.get('User-Agent') || 'unknown');

      res.status(201).json({
        message: `Notice sent to ${usersResult.rows.length} user(s)`,
        notice: noticeResult.rows[0],
      });
    } catch (err) {
      logger.error({ err }, 'Create notice error');
      res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/notices', authenticate, authorize('admin'), async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT n.*, u.username AS created_by_name
       FROM admin_notices n
       LEFT JOIN users u ON n.created_by = u.id
       ORDER BY n.created_at DESC LIMIT 50`
    );
    res.status(200).json(result.rows);
  } catch (err) {
    logger.error({ err }, 'List notices error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin notifications
router.get('/notifications', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const result = await query(
      'SELECT id, title, message, is_read, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.user!.id]
    );
    const unreadResult = await query(
      "SELECT COUNT(*) as cnt FROM notifications WHERE user_id = $1 AND is_read = false",
      [req.user!.id]
    );
    res.status(200).json({ notifications: result.rows, unread_count: parseInt(unreadResult.rows[0].cnt) });
  } catch (err) {
    logger.error({ err }, 'Fetch notifications error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/notifications/:id/read', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    await query(
      'UPDATE notifications SET is_read = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.id]
    );
    res.status(200).json({ message: 'Notification marked as read' });
  } catch (err) {
    logger.error({ err }, 'Mark notification read error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/audit-log', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    const result = await query(
      `SELECT a.*, u.username, u.email
       FROM audit_log a
       LEFT JOIN users u ON a.actor_id = u.id
       ORDER BY a.timestamp DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await query('SELECT COUNT(*) FROM audit_log');

    res.status(200).json({
      page,
      limit,
      total: parseInt(countResult.rows[0].count),
      entries: result.rows
    });
  } catch (err) {
    logger.error({ err }, 'Fetch audit log error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/wipe-requests', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string || 'pending';

    const result = await query(
      `SELECT w.*, u.username AS patient_username, u.email AS patient_email
       FROM data_wipe_requests w
       JOIN patients p ON w.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE w.status = $1
       ORDER BY w.created_at DESC`,
      [status]
    );

    res.status(200).json(result.rows);
  } catch (err) {
    logger.error({ err }, 'List wipe requests error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function cascadingDeletePatient(patientId: string, adminId: string): Promise<void> {
  await query('DELETE FROM consents WHERE patient_id = $1', [patientId]);
  await query('DELETE FROM records WHERE patient_id = $1', [patientId]);
  await query('DELETE FROM data_wipe_requests WHERE patient_id = $1', [patientId]);

  const patientResult = await query('DELETE FROM patients WHERE id = $1 RETURNING user_id', [patientId]);

  if (patientResult.rows.length) {
    const userId = patientResult.rows[0].user_id;
    if (userId) {
      await query('DELETE FROM notifications WHERE user_id = $1', [userId]);
    }
  }

  await insertAuditLog(adminId, 'DATA_WIPE_EXECUTED', patientId, 'system', 'admin-wipe-flow');
  logger.info({ patientId, adminId }, 'Cascading data wipe completed');
}

router.post('/wipe-requests/:id/approve', authenticate, authorize('admin'),
  auditLog('WIPE_APPROVED'),
  async (req: Request, res: Response) => {
    try {
      const wipeResult = await query(
        `SELECT w.*, p.user_id FROM data_wipe_requests w
         JOIN patients p ON w.patient_id = p.id
         WHERE w.id = $1 AND w.status = 'pending'`,
        [req.params.id]
      );

      if (!wipeResult.rows.length) {
        res.status(404).json({ error: 'Pending wipe request not found' });
        return;
      }

      const wipeRequest = wipeResult.rows[0];

      await query(
        `UPDATE data_wipe_requests SET status = 'approved', approved_by = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [req.user!.id, req.params.id]
      );

      await cascadingDeletePatient(wipeRequest.patient_id, req.user!.id);

      res.status(200).json({
        message: 'Wipe request approved. All patient data has been permanently deleted.',
        request_id: req.params.id,
        patient_id: wipeRequest.patient_id
      });
    } catch (err) {
      logger.error({ err }, 'Approve wipe error');
      res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/wipe-requests/:id/reject', authenticate, authorize('admin'),
  auditLog('WIPE_REJECTED'),
  async (req: Request, res: Response) => {
    try {
      const result = await query(
        `UPDATE data_wipe_requests SET status = 'rejected', approved_by = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND status = 'pending' RETURNING *`,
        [req.user!.id, req.params.id]
      );

      if (!result.rows.length) {
        res.status(404).json({ error: 'Pending wipe request not found' });
        return;
      }

      const wr = result.rows[0];
      const patientUser = await query(
        'SELECT user_id FROM patients WHERE id = $1', [wr.patient_id]
      );
      if (patientUser.rows.length) {
        await query(
          `INSERT INTO notifications (user_id, type, title, message) VALUES ($1, 'wipe_rejected', 'Data Wipe Request Denied', 'Your request to wipe all data has been declined by an administrator.')`,
          [patientUser.rows[0].user_id]
        );
      }

      await insertAuditLog(req.user!.id, 'WIPE_REJECTED', wr.patient_id,
        req.ip || 'unknown', req.get('User-Agent') || 'unknown');

      res.status(200).json({ message: 'Wipe request rejected', request: wr });
    } catch (err) {
      logger.error({ err }, 'Reject wipe error');
      res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/storage-requests', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string || 'pending';

    const result = await query(
      `SELECT s.*, u.username AS patient_username, u.email AS patient_email
       FROM storage_requests s
       JOIN patients p ON s.patient_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE s.status = $1
       ORDER BY s.created_at DESC`,
      [status]
    );

    res.status(200).json(result.rows);
  } catch (err) {
    logger.error({ err }, 'List storage requests error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/storage-requests/:id/approve', authenticate, authorize('admin'),
  async (req: Request, res: Response) => {
    try {
      const srResult = await query(
        `SELECT s.*, p.user_id FROM storage_requests s
         JOIN patients p ON s.patient_id = p.id
         WHERE s.id = $1 AND s.status = 'pending'`,
        [req.params.id]
      );

      if (!srResult.rows.length) {
        res.status(404).json({ error: 'Pending storage request not found' });
        return;
      }

      const sr = srResult.rows[0];

      await query(
        `UPDATE storage_requests SET status = 'approved', reviewed_by = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [req.user!.id, req.params.id]
      );

      await query(
        `UPDATE patients SET storage_limit = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [sr.requested_limit, sr.patient_id]
      );

      if (sr.user_id) {
        await query(
          `INSERT INTO notifications (user_id, type, title, message) VALUES ($1, 'storage_approved', 'Storage Limit Increased', $2)`,
          [sr.user_id, `Your storage limit has been increased to ${(sr.requested_limit / 1073741824).toFixed(1)} GB.`]
        );
      }

      await insertAuditLog(req.user!.id, 'STORAGE_REQUEST_APPROVED', sr.patient_id,
        req.ip || 'unknown', req.get('User-Agent') || 'unknown');

      res.status(200).json({
        message: 'Storage request approved',
        request_id: req.params.id,
        new_limit: sr.requested_limit,
      });
    } catch (err) {
      logger.error({ err }, 'Approve storage request error');
      res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/storage-requests/:id/reject', authenticate, authorize('admin'),
  async (req: Request, res: Response) => {
    try {
      const srResult = await query(
        `SELECT s.*, p.user_id FROM storage_requests s
         JOIN patients p ON s.patient_id = p.id
         WHERE s.id = $1 AND s.status = 'pending'`,
        [req.params.id]
      );

      if (!srResult.rows.length) {
        res.status(404).json({ error: 'Pending storage request not found' });
        return;
      }

      const sr = srResult.rows[0];

      await query(
        `UPDATE storage_requests SET status = 'rejected', reviewed_by = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [req.user!.id, req.params.id]
      );

      if (sr.user_id) {
        await query(
          `INSERT INTO notifications (user_id, type, title, message) VALUES ($1, 'storage_rejected', 'Storage Request Denied', $2)`,
          [sr.user_id, 'Your request for a storage limit increase has been declined.']
        );
      }

      await insertAuditLog(req.user!.id, 'STORAGE_REQUEST_REJECTED', sr.patient_id,
        req.ip || 'unknown', req.get('User-Agent') || 'unknown');

      res.status(200).json({ message: 'Storage request rejected', request_id: req.params.id });
    } catch (err) {
      logger.error({ err }, 'Reject storage request error');
      res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Doctor Verification Routes ---

// List doctors pending verification
router.get('/verify-doctors', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || 'pending';

    const result = await query(
      `SELECT dp.*, u.email, u.username, u.is_verified
       FROM doctor_profiles dp
       JOIN users u ON u.id = dp.user_id
       WHERE dp.verification_status = $1
       ORDER BY dp.created_at ASC`,
      [status]
    );

    res.status(200).json(result.rows);
  } catch (err) {
    logger.error({ err }, 'List verification requests error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Approve doctor
router.post('/verify-doctors/:id/approve', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const profile = await query(
      'SELECT user_id FROM doctor_profiles WHERE id = $1',
      [req.params.id]
    );

    if (!profile.rows.length) {
      res.status(404).json({ error: 'Doctor profile not found' });
      return;
    }

    await query('UPDATE users SET is_verified = true WHERE id = $1', [profile.rows[0].user_id]);
    await query(
      "UPDATE doctor_profiles SET verification_status = 'approved' WHERE id = $1",
      [req.params.id]
    );
    await query(
      `INSERT INTO notifications (user_id, type, link, title, message)
       VALUES ($1, 'verification_approved', '/doctor/profile', 'Verification Approved', 'Your doctor account has been verified. You can now access patient records.')`,
      [profile.rows[0].user_id]
    );

    await insertAuditLog(req.user!.id, 'DOCTOR_VERIFIED', profile.rows[0].user_id,
      req.ip || 'unknown', req.get('User-Agent') || 'unknown');

    res.status(200).json({ message: 'Doctor verified successfully' });
  } catch (err) {
    logger.error({ err }, 'Approve doctor error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reject doctor
router.post('/verify-doctors/:id/reject', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;

    const profile = await query(
      'SELECT user_id FROM doctor_profiles WHERE id = $1',
      [req.params.id]
    );

    if (!profile.rows.length) {
      res.status(404).json({ error: 'Doctor profile not found' });
      return;
    }

    await query(
      "UPDATE doctor_profiles SET verification_status = 'rejected', rejection_reason = $1 WHERE id = $2",
      [reason || 'Not specified', req.params.id]
    );
    await query(
      `INSERT INTO notifications (user_id, type, link, title, message)
       VALUES ($1, 'verification_rejected', '/doctor/profile', 'Verification Rejected', $2)`,
      [profile.rows[0].user_id, reason ? `Your verification was rejected: ${reason}` : 'Your verification was rejected. Please update your profile and resubmit.']
    );

    await insertAuditLog(req.user!.id, 'DOCTOR_REJECTED', profile.rows[0].user_id,
      req.ip || 'unknown', req.get('User-Agent') || 'unknown');

    res.status(200).json({ message: 'Doctor verification rejected' });
  } catch (err) {
    logger.error({ err }, 'Reject doctor error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── IP Blocks ──────────────────────────────────────────

router.get('/ip-blocks', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string || 'active';
    let sql = `SELECT ib.*, u.email as affected_email, u.username as affected_username
               FROM ip_blocks ib
               LEFT JOIN users u ON ib.affected_user_id = u.id
               WHERE 1=1`;
    const params: any[] = [];
    if (status !== 'all') {
      sql += ` AND ib.status = $1`;
      params.push(status);
    }
    sql += ` ORDER BY ib.blocked_at DESC LIMIT 100`;
    const result = await query(sql, params);
    res.status(200).json(result.rows);
  } catch (err) {
    logger.error({ err }, 'List IP blocks error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/ip-blocks/:id/status', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    if (!['reviewed', 'unblocked'].includes(status)) {
      res.status(400).json({ error: 'Status must be "reviewed" or "unblocked"' });
      return;
    }

    if (status === 'unblocked') {
      const ok = await unblockIP(req.params.id, req.user!.id);
      if (!ok) { res.status(404).json({ error: 'Block not found' }); return; }
      await insertAuditLog(req.user!.id, 'IP_UNBLOCKED', req.params.id,
        req.ip || 'unknown', req.get('User-Agent') || 'unknown');
      res.status(200).json({ message: 'IP unblocked' });
      return;
    }

    await query(`UPDATE ip_blocks SET status = 'reviewed' WHERE id = $1`, [req.params.id]);
    await insertAuditLog(req.user!.id, 'IP_REVIEWED', req.params.id,
      req.ip || 'unknown', req.get('User-Agent') || 'unknown');
    res.status(200).json({ message: 'IP marked as reviewed' });
  } catch (err) {
    logger.error({ err }, 'Update IP block error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/ip-blocks/:id/notes', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  try {
    const { notes } = req.body;
    await query(`UPDATE ip_blocks SET notes = $1 WHERE id = $2`, [notes, req.params.id]);
    res.status(200).json({ message: 'Notes updated' });
  } catch (err) {
    logger.error({ err }, 'Update IP block notes error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
