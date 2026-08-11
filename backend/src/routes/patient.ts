import { Router, Request, Response } from 'express';
import fs from 'fs';
import crypto from 'crypto';
import QRCode from 'qrcode';
import jwt from 'jsonwebtoken';
import { query } from '../db';
import { authenticate, authorize } from '../middleware/authorize';
import { auditLog, insertAuditLog } from '../middleware/auditLogger';
import { upload } from '../middleware/fileUpload';
import { decryptForPatient, makePatientDecryptor, makePatientEncryptor } from '../crypto';
import logger from '../logger';

const router = Router();

async function decryptPatientRecord(row: any, dc: (buf: Buffer) => Promise<string>): Promise<any> {
  return {
    id: row.id,
    patient_id: row.patient_id,
    hospital_id: row.hospital_id,
    doctor_id: row.doctor_id,
    source: row.source,
    category: row.category || 'general',
    title: row.encrypted_title ? await dc(row.encrypted_title) : null,
    description: row.encrypted_description ? await dc(row.encrypted_description) : null,
    file_path: row.encrypted_file_path ? await dc(row.encrypted_file_path) : null,
    file_hash: row.encrypted_file_hash ? await dc(row.encrypted_file_hash) : null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function decryptPatientInfo(row: any, dc: (buf: any) => Promise<string | null>) {
  return {
    id: row.id,
    user_id: row.user_id,
    first_name: row.encrypted_first_name ? await dc(row.encrypted_first_name) : null,
    last_name: row.encrypted_last_name ? await dc(row.encrypted_last_name) : null,
    dob: row.encrypted_dob ? await dc(row.encrypted_dob) : null,
    phone: row.encrypted_phone ? await dc(row.encrypted_phone) : null,
    address: row.encrypted_address ? await dc(row.encrypted_address) : null,
    national_id: row.encrypted_national_id ? await dc(row.encrypted_national_id) : null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

router.get('/profile', authenticate, authorize('patient'), async (req: Request, res: Response) => {
  try {
    const result = await query(
      'SELECT * FROM patients WHERE user_id = $1',
      [req.user!.id]
    );

    if (!result.rows.length) {
      res.status(404).json({ error: 'Patient profile not found' });
      return;
    }

    const dc = await makePatientDecryptor(result.rows[0].id);
    const decrypted = await decryptPatientInfo(result.rows[0], dc);
    res.status(200).json(decrypted);
  } catch (err) {
    logger.error({ err }, 'Fetch patient profile error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/profile', authenticate, authorize('patient'), async (req: Request, res: Response) => {
  try {
    const { first_name, last_name, phone, address } = req.body;

    const patientResult = await query(
      'SELECT id FROM patients WHERE user_id = $1',
      [req.user!.id]
    );

    if (!patientResult.rows.length) {
      res.status(404).json({ error: 'Patient profile not found' });
      return;
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    const ec = await makePatientEncryptor(patientResult.rows[0].id);
    const dc = await makePatientDecryptor(patientResult.rows[0].id);

    if (first_name !== undefined) {
      updates.push(`encrypted_first_name = $${paramIdx++}`);
      values.push(await ec(sanitizeInput(first_name).substring(0, 100)));
    }
    if (last_name !== undefined) {
      updates.push(`encrypted_last_name = $${paramIdx++}`);
      values.push(await ec(sanitizeInput(last_name).substring(0, 100)));
    }
    if (phone !== undefined) {
      updates.push(`encrypted_phone = $${paramIdx++}`);
      values.push(await ec(sanitizeInput(phone).substring(0, 20)));
    }
    if (address !== undefined) {
      updates.push(`encrypted_address = $${paramIdx++}`);
      values.push(await ec(sanitizeInput(address).substring(0, 500)));
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    values.push(patientResult.rows[0].id);
    await query(
      `UPDATE patients SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIdx}`,
      values
    );

    const updated = await query('SELECT * FROM patients WHERE id = $1', [patientResult.rows[0].id]);
    const decrypted = await decryptPatientInfo(updated.rows[0], dc);
    res.status(200).json({ message: 'Profile updated', profile: decrypted });
  } catch (err) {
    logger.error({ err }, 'Update patient profile error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/records', authenticate, authorize('patient'), async (req: Request, res: Response) => {
  try {
    const patientResult = await query(
      'SELECT id FROM patients WHERE user_id = $1',
      [req.user!.id]
    );

    if (!patientResult.rows.length) {
      res.status(404).json({ error: 'Patient profile not found' });
      return;
    }

    const patientId = patientResult.rows[0].id;
    const dc = await makePatientDecryptor(patientId);
    const result = await query(
      'SELECT * FROM records WHERE patient_id = $1 ORDER BY created_at DESC',
      [patientId]
    );

    const decrypted = await Promise.all(result.rows.map(async (row: any) => {
      try {
        return await decryptPatientRecord(row, dc);
      } catch {
        return null;
      }
    }));
    res.status(200).json(decrypted.filter(Boolean));
  } catch (err) {
    logger.error({ err }, 'Fetch patient records error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/records', authenticate, authorize('patient'), async (req: Request, res: Response) => {
  try {
    const { title, description, file_path, file_hash } = req.body;

    if (!title || !description) {
      res.status(400).json({ error: 'Title and description are required' });
      return;
    }

    const patientResult = await query(
      'SELECT id FROM patients WHERE user_id = $1',
      [req.user!.id]
    );

    if (!patientResult.rows.length) {
      res.status(404).json({ error: 'Patient profile not found. Create a profile first.' });
      return;
    }

    const patientId = patientResult.rows[0].id;

    const ec = await makePatientEncryptor(patientId);
    const encTitle = await ec(title);
    const encDescription = await ec(description);
    const encFilePath = file_path ? await ec(file_path) : null;
    const encFileHash = file_hash ? await ec(file_hash) : null;

    const result = await query(
      `INSERT INTO records (patient_id, source, encrypted_title, encrypted_description, encrypted_file_path, encrypted_file_hash)
       VALUES ($1, 'patient_upload', $2, $3, $4, $5)
       RETURNING id, source, created_at`,
      [patientId, encTitle, encDescription, encFilePath, encFileHash]
    );

    res.status(201).json({
      message: 'Record uploaded successfully',
      record: result.rows[0]
    });
  } catch (err) {
    logger.error({ err }, 'Upload record error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/records/upload', authenticate, authorize('patient'), upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const { title, description } = req.body;

      if (!title || !description) {
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        res.status(400).json({ error: 'Title and description are required' });
        return;
      }

      const patientResult = await query(
        'SELECT id FROM patients WHERE user_id = $1',
        [req.user!.id]
      );

      if (!patientResult.rows.length) {
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        res.status(404).json({ error: 'Patient profile not found' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'File is required' });
        return;
      }

      const fileBuffer = fs.readFileSync(req.file.path);
      const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      const sanitizedTitle = sanitizeInput(title);
      const sanitizedDesc = sanitizeInput(description);

      const patientId = patientResult.rows[0].id;

      const storageCheck = await query(
        `SELECT storage_limit, COALESCE((SELECT SUM(file_size) FROM records WHERE patient_id = $1), 0) AS used
         FROM patients WHERE id = $1`,
        [patientId]
      );
      const storageLimit = Number(storageCheck.rows[0].storage_limit);
      const storageUsed = Number(storageCheck.rows[0].used);
      const fileSize = req.file.size;

      if (storageUsed + fileSize > storageLimit) {
        fs.unlinkSync(req.file.path);
        res.status(413).json({ error: 'Storage limit exceeded', used: storageUsed, limit: storageLimit });
        return;
      }

      const ec = await makePatientEncryptor(patientId);
      const encTitle = await ec(sanitizedTitle);
      const encDescription = await ec(sanitizedDesc);
      const encFilePath = await ec(req.file.path);
      const encFileHash = await ec(fileHash);

      const result = await query(
        `INSERT INTO records (patient_id, source, encrypted_title, encrypted_description, encrypted_file_path, encrypted_file_hash, file_size)
         VALUES ($1, 'patient_upload', $2, $3, $4, $5, $6)
         RETURNING id, source, created_at`,
        [patientId, encTitle, encDescription, encFilePath, encFileHash, fileSize]
      );

      logger.info({ recordId: result.rows[0].id, fileSize: req.file.size, fileHash }, 'File upload with security checks passed');

      res.status(201).json({
        message: 'Record with file uploaded successfully',
        record: result.rows[0],
        file: {
          originalName: req.file.originalname,
          size: req.file.size,
          hash: fileHash,
        }
      });
    } catch (err) {
      if (req.file) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      logger.error({ err }, 'File upload record error');
      res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/records/:id', authenticate, authorize('patient'), async (req: Request, res: Response) => {
  try {
    const patientResult = await query(
      'SELECT id FROM patients WHERE user_id = $1',
      [req.user!.id]
    );

    if (!patientResult.rows.length) {
      res.status(404).json({ error: 'Patient profile not found' });
      return;
    }

    const recordResult = await query(
      'SELECT encrypted_file_path FROM records WHERE id = $1 AND patient_id = $2',
      [req.params.id, patientResult.rows[0].id]
    );

    if (!recordResult.rows.length) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }

    if (recordResult.rows[0].encrypted_file_path) {
      try {
        const filePath = await decryptForPatient(patientResult.rows[0].id, recordResult.rows[0].encrypted_file_path);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {}
    }

    await query('DELETE FROM records WHERE id = $1 AND patient_id = $2', [req.params.id, patientResult.rows[0].id]);
    res.status(200).json({ message: 'Record deleted' });
  } catch (err) {
    logger.error({ err }, 'Delete record error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/records/file/:recordId', authenticate, authorize('patient'), async (req: Request, res: Response) => {
  try {
    const patientResult = await query(
      'SELECT id FROM patients WHERE user_id = $1',
      [req.user!.id]
    );

    if (!patientResult.rows.length) {
      res.status(404).json({ error: 'Patient profile not found' });
      return;
    }

    const recordResult = await query(
      'SELECT encrypted_file_path FROM records WHERE id = $1 AND patient_id = $2',
      [req.params.recordId, patientResult.rows[0].id]
    );

    if (!recordResult.rows.length || !recordResult.rows[0].encrypted_file_path) {
      res.status(404).json({ error: 'Record or file not found' });
      return;
    }

    const decryptedPath = await decryptForPatient(patientResult.rows[0].id, recordResult.rows[0].encrypted_file_path);

    if (!fs.existsSync(decryptedPath)) {
      res.status(404).json({ error: 'File not found on storage' });
      return;
    }

    res.sendFile(decryptedPath);
  } catch (err) {
    logger.error({ err }, 'Download file error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

function sanitizeInput(input: string): string {
  const stripped = input
    .replace(/<[^>]*>/g, '')
    .replace(/[\0\b\f\n\r\t\v]/g, ' ')
    .replace(/[;&|`$]/g, '')
    .trim();

  return stripped.substring(0, 500);
}

router.get('/records/access-stats', authenticate, authorize('patient'), async (req: Request, res: Response) => {
  try {
    const patientResult = await query(
      'SELECT id FROM patients WHERE user_id = $1',
      [req.user!.id]
    );
    if (!patientResult.rows.length) {
      res.status(404).json({ error: 'Patient profile not found' });
      return;
    }

    const result = await query(
      `SELECT ral.record_id, ral.doctor_id,
              COUNT(*) AS view_count, MAX(ral.accessed_at) AS last_viewed_at,
              u.username AS doctor_username, dp.full_name AS doctor_name
       FROM record_access_log ral
       JOIN users u ON u.id = ral.doctor_id
       LEFT JOIN doctor_profiles dp ON dp.user_id = ral.doctor_id
       WHERE ral.patient_id = $1
       GROUP BY ral.record_id, ral.doctor_id, u.username, dp.full_name
       ORDER BY MAX(ral.accessed_at) DESC`,
      [patientResult.rows[0].id]
    );

    res.status(200).json(result.rows);
  } catch (err) {
    logger.error({ err }, 'Fetch record access stats error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/storage-info', authenticate, authorize('patient'), async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT p.storage_limit, COALESCE((SELECT SUM(r.file_size) FROM records r JOIN patients pp ON r.patient_id = pp.id WHERE pp.user_id = $1), 0) AS used,
        (SELECT id FROM storage_requests WHERE patient_id = (SELECT id FROM patients WHERE user_id = $1) AND status = 'pending' LIMIT 1) AS pending_request_id
      FROM patients p WHERE p.user_id = $1`,
      [req.user!.id]
    );

    if (!result.rows.length) {
      res.status(404).json({ error: 'Patient profile not found' });
      return;
    }

    res.json({
      used: Number(result.rows[0].used),
      limit: Number(result.rows[0].storage_limit),
      hasPendingRequest: !!result.rows[0].pending_request_id,
    });
  } catch (err) {
    logger.error({ err }, 'Storage info error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/storage-request', authenticate, authorize('patient'), async (req: Request, res: Response) => {
  try {
    const { requested_limit, reason } = req.body;

    if (!requested_limit || !reason) {
      res.status(400).json({ error: 'requested_limit and reason are required' });
      return;
    }

    if (requested_limit < 2147483648) {
      res.status(400).json({ error: 'Requested limit must be greater than 2 GB' });
      return;
    }

    const patientResult = await query(
      'SELECT id FROM patients WHERE user_id = $1',
      [req.user!.id]
    );

    if (!patientResult.rows.length) {
      res.status(404).json({ error: 'Patient profile not found' });
      return;
    }

    const existing = await query(
      "SELECT id FROM storage_requests WHERE patient_id = $1 AND status = 'pending'",
      [patientResult.rows[0].id]
    );

    if (existing.rows.length) {
      res.status(409).json({ error: 'A pending storage request already exists' });
      return;
    }

    const storageReq = await query(
      `INSERT INTO storage_requests (patient_id, requested_limit, reason) VALUES ($1, $2, $3) RETURNING *`,
      [patientResult.rows[0].id, requested_limit, reason]
    );

    await query(
      `INSERT INTO notifications (user_id, title, message)
       SELECT u.id, 'Storage Increase Request', $1
       FROM users u WHERE u.role = 'admin'`,
      [`Patient ${req.user!.email} requested a storage increase to ${(requested_limit / 1073741824).toFixed(1)} GB.`]
    );

    await insertAuditLog(req.user!.id, 'STORAGE_REQUESTED', patientResult.rows[0].id, req.ip || 'unknown', req.get('User-Agent') || 'unknown');

    res.status(201).json({
      message: 'Storage increase request submitted',
      request: storageReq.rows[0],
    });
  } catch (err) {
    logger.error({ err }, 'Storage request error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/consents', authenticate, authorize('patient'), async (req: Request, res: Response) => {
  try {
    const patientResult = await query(
      'SELECT id FROM patients WHERE user_id = $1',
      [req.user!.id]
    );

    if (!patientResult.rows.length) {
      res.status(404).json({ error: 'Patient profile not found' });
      return;
    }

    const result = await query(
      `SELECT c.*, u.username, u.email, dp.full_name, dp.hospital_name, dp.hospital_address, dp.license_number, dp.phone, dp.certificates, dp.availability
       FROM consents c
       JOIN users u ON c.doctor_id = u.id
       LEFT JOIN doctor_profiles dp ON dp.user_id = c.doctor_id
       WHERE c.patient_id = $1
       ORDER BY c.created_at DESC`,
      [patientResult.rows[0].id]
    );

    res.status(200).json(result.rows);
  } catch (err) {
    logger.error({ err }, 'Fetch consents error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/consents', authenticate, authorize('patient'), auditLog('CONSENT_GRANTED'),
  async (req: Request, res: Response) => {
    try {
      const { doctor_id, scoped_access, expires_in_days } = req.body;

      if (!doctor_id || !scoped_access) {
        res.status(400).json({ error: 'doctor_id and scoped_access are required' });
        return;
      }

      if (!['all', 'read_only', 'emergency_only'].includes(scoped_access)) {
        res.status(400).json({ error: 'Invalid scoped_access. Must be: all, read_only, or emergency_only' });
        return;
      }

      const patientResult = await query(
        'SELECT id FROM patients WHERE user_id = $1',
        [req.user!.id]
      );

      if (!patientResult.rows.length) {
        res.status(404).json({ error: 'Patient profile not found' });
        return;
      }

      const doctorResult = await query(
        "SELECT id, role FROM users WHERE id = $1 AND role = 'doctor'",
        [doctor_id]
      );

      if (!doctorResult.rows.length) {
        res.status(404).json({ error: 'Doctor not found' });
        return;
      }

      const maxDays = expires_in_days || 30;
      const result = await query(
        `INSERT INTO consents (patient_id, doctor_id, scoped_access, expires_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '1 day' * $4)
         RETURNING *`,
        [patientResult.rows[0].id, doctor_id, scoped_access, maxDays]
      );

      res.status(201).json({
        message: 'Consent granted',
        consent: result.rows[0]
      });
    } catch (err) {
      logger.error({ err }, 'Grant consent error');
      res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/consents/:id', authenticate, authorize('patient'), auditLog('CONSENT_REVOKED'),
  async (req: Request, res: Response) => {
    try {
      const patientResult = await query(
        'SELECT id FROM patients WHERE user_id = $1',
        [req.user!.id]
      );

      if (!patientResult.rows.length) {
        res.status(404).json({ error: 'Patient profile not found' });
        return;
      }

      const result = await query(
        `UPDATE consents SET status = 'revoked', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND patient_id = $2 AND status = 'active'
         RETURNING id, status`,
        [req.params.id, patientResult.rows[0].id]
      );

      if (!result.rows.length) {
        res.status(404).json({ error: 'Consent not found or already revoked' });
        return;
      }

      res.status(200).json({ message: 'Consent revoked', consent: result.rows[0] });
    } catch (err) {
      logger.error({ err }, 'Revoke consent error');
      res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Approve pending consent request ---
router.post('/consents/:id/approve', authenticate, authorize('patient'), auditLog('CONSENT_APPROVED'),
  async (req: Request, res: Response) => {
    try {
      const patientResult = await query(
        'SELECT id FROM patients WHERE user_id = $1',
        [req.user!.id]
      );

      if (!patientResult.rows.length) {
        res.status(404).json({ error: 'Patient profile not found' });
        return;
      }

      const consentId = req.params.id;
      const result = await query(
        `UPDATE consents SET status = 'active', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND patient_id = $2 AND status = 'pending'
         RETURNING id, doctor_id`,
        [consentId, patientResult.rows[0].id]
      );

      if (!result.rows.length) {
        res.status(404).json({ error: 'Pending consent not found' });
        return;
      }

      const doctorId = result.rows[0].doctor_id;

      // Insert all existing records as visible by default
      await query(
        `INSERT INTO consent_record_permissions (consent_id, record_id, visible)
         SELECT $1, r.id, true FROM records r
         WHERE r.patient_id = $2
         ON CONFLICT (consent_id, record_id) DO NOTHING`,
        [consentId, patientResult.rows[0].id]
      );

      // Notify doctor
      await query(
        `INSERT INTO notifications (user_id, title, message)
         VALUES ($1, 'Consent Approved', 'The patient has approved your consent request.')`,
        [doctorId]
      );

      res.status(200).json({ message: 'Consent approved' });
    } catch (err) {
      logger.error({ err }, 'Approve consent error');
      res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Decline pending consent request ---
router.post('/consents/:id/decline', authenticate, authorize('patient'), auditLog('CONSENT_DECLINED'),
  async (req: Request, res: Response) => {
    try {
      const patientResult = await query(
        'SELECT id FROM patients WHERE user_id = $1',
        [req.user!.id]
      );

      if (!patientResult.rows.length) {
        res.status(404).json({ error: 'Patient profile not found' });
        return;
      }

      const result = await query(
        `DELETE FROM consents
         WHERE id = $1 AND patient_id = $2 AND status = 'pending'
         RETURNING doctor_id`,
        [req.params.id, patientResult.rows[0].id]
      );

      if (!result.rows.length) {
        res.status(404).json({ error: 'Pending consent not found' });
        return;
      }

      res.status(200).json({ message: 'Consent request declined' });
    } catch (err) {
      logger.error({ err }, 'Decline consent error');
      res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Get records with permission toggles for a consent ---
router.get('/consents/:id/records', authenticate, authorize('patient'), async (req: Request, res: Response) => {
  try {
    const patientResult = await query(
      'SELECT id FROM patients WHERE user_id = $1',
      [req.user!.id]
    );

    if (!patientResult.rows.length) {
      res.status(404).json({ error: 'Patient profile not found' });
      return;
    }

    const records = await query(
      `SELECT r.id, r.source,
              CASE WHEN r.source = 'patient_upload' THEN 'patient' ELSE 'doctor' END AS source_label,
              COALESCE(crp.visible, true) AS visible
       FROM records r
       LEFT JOIN consent_record_permissions crp ON crp.record_id = r.id AND crp.consent_id = $1
       WHERE r.patient_id = $2
       ORDER BY r.created_at DESC`,
      [req.params.id, patientResult.rows[0].id]
    );

    const dc = await makePatientDecryptor(patientResult.rows[0].id);
    const decrypted = await Promise.all(records.rows.map(async (row: any) => {
      try {
        const rec = await decryptPatientRecord(row, dc);
        return { ...rec, visible: row.visible };
      } catch {
        return null;
      }
    }));

    res.status(200).json(decrypted.filter(Boolean));
  } catch (err) {
    logger.error({ err }, 'Fetch consent records error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Toggle record visibility for a consent ---
router.post('/consents/:id/records/:recordId/toggle', authenticate, authorize('patient'), async (req: Request, res: Response) => {
  try {
    const consentId = req.params.id;
    const recordId = req.params.recordId;

    const current = await query(
      `SELECT crp.visible FROM consent_record_permissions crp
       JOIN consents c ON c.id = crp.consent_id
       JOIN patients p ON p.id = c.patient_id
       WHERE crp.consent_id = $1 AND crp.record_id = $2 AND p.user_id = $3`,
      [consentId, recordId, req.user!.id]
    );

    if (current.rows.length) {
      await query(
        `UPDATE consent_record_permissions SET visible = NOT visible
         WHERE consent_id = $1 AND record_id = $2`,
        [consentId, recordId]
      );
    } else {
      await query(
        `INSERT INTO consent_record_permissions (consent_id, record_id, visible)
         VALUES ($1, $2, false)`,
        [consentId, recordId]
      );
    }

    res.status(200).json({ message: 'Record visibility toggled' });
  } catch (err) {
    logger.error({ err }, 'Toggle record visibility error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/wipe-request', authenticate, authorize('patient'), auditLog('WIPE_REQUESTED'),
  async (req: Request, res: Response) => {
    try {
      const { reason } = req.body;

      if (!reason) {
        res.status(400).json({ error: 'Reason is required for wipe request' });
        return;
      }

      const patientResult = await query(
        'SELECT id FROM patients WHERE user_id = $1',
        [req.user!.id]
      );

      if (!patientResult.rows.length) {
        res.status(404).json({ error: 'Patient profile not found' });
        return;
      }

      const existing = await query(
        "SELECT id FROM data_wipe_requests WHERE patient_id = $1 AND status = 'pending'",
        [patientResult.rows[0].id]
      );

      if (existing.rows.length) {
        res.status(409).json({ error: 'A pending wipe request already exists' });
        return;
      }

      const result = await query(
        `INSERT INTO data_wipe_requests (patient_id, reason) VALUES ($1, $2) RETURNING *`,
        [patientResult.rows[0].id, reason]
      );

      res.status(201).json({
        message: 'Data wipe request submitted. Awaiting admin approval.',
        request: result.rows[0]
      });
    } catch (err) {
      logger.error({ err }, 'Wipe request error');
      res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/audit-qr', authenticate, authorize('patient'), async (req: Request, res: Response) => {
  try {
    const { fromDate, toDate, action } = req.query;
    const token = jwt.sign(
      { sub: req.user!.id, scope: 'audit_view', fromDate, toDate, action },
      process.env.JWT_SECRET || 'your-super-secret-jwt-key-min-32-chars',
      { expiresIn: '24h', issuer: 'chds-nepal' }
    );
    const params = new URLSearchParams({ token });
    if (fromDate && typeof fromDate === 'string') params.set('fromDate', fromDate);
    if (toDate && typeof toDate === 'string') params.set('toDate', toDate);
    if (action && typeof action === 'string') params.set('action', action);
    const qrUrl = `${req.protocol}://${req.get('host')}/api/v1/public/audit-log?${params.toString()}`;
    const qrDataUrl = await QRCode.toDataURL(qrUrl);
    res.json({ qrCode: qrDataUrl, expiresIn: '24h', url: qrUrl });
  } catch (err) {
    logger.error({ err }, 'Generate audit QR error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/audit-log', authenticate, authorize('patient'), async (req: Request, res: Response) => {
  try {
    const { fromDate, toDate, action } = req.query;
    const userResult = await query('SELECT id FROM patients WHERE user_id = $1', [req.user!.id]);
    const patientId = userResult.rows[0]?.id;

    let sql = `SELECT a.id, a.action, a.target_id, a.override_reason, a.ip_address, a.user_agent, a.timestamp,
                      u.username, u.email, u.role as actor_role
               FROM audit_log a
               LEFT JOIN users u ON a.actor_id = u.id
               WHERE (a.actor_id = $1 OR a.target_id = $1`;
    const params: any[] = [req.user!.id];
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
    if (action) {
      sql += ` AND a.action ILIKE $${paramIdx++}`;
      params.push(`%${action}%`);
    }
    sql += ` ORDER BY a.timestamp DESC LIMIT 200`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, 'Fetch audit log error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/audit-log/download', authenticate, authorize('patient'), async (req: Request, res: Response) => {
  try {
    const { fromDate, toDate, action } = req.query;
    const userResult = await query('SELECT id FROM patients WHERE user_id = $1', [req.user!.id]);
    const patientId = userResult.rows[0]?.id;

    let sql = `SELECT a.timestamp, a.action, u.username, u.email, u.role as actor_role,
                      a.ip_address, a.override_reason
               FROM audit_log a
               LEFT JOIN users u ON a.actor_id = u.id
               WHERE (a.actor_id = $1 OR a.target_id = $1`;
    const params: any[] = [req.user!.id];
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
    if (action) {
      sql += ` AND a.action ILIKE $${paramIdx++}`;
      params.push(`%${action}%`);
    }
    sql += ` ORDER BY a.timestamp DESC`;

    const result = await query(sql, params);
    let csv = 'Timestamp,Action,Actor,Actor Role,IP Address,Details\n';
    for (const row of result.rows) {
      const actor = (row.username || row.email || 'System').replace(/"/g, '""');
      csv += `"${row.timestamp}","${row.action}","${actor}","${row.actor_role || 'system'}","${row.ip_address || ''}","${(row.override_reason || '').replace(/"/g, '""')}"\n`;
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
    res.send(csv);
  } catch (err) {
    logger.error({ err }, 'Download audit log error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;