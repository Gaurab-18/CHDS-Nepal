import { Router, Request, Response } from 'express';
import { query } from '../db';
import { authenticate, authorize } from '../middleware/authorize';
import { auditLog, insertAuditLog } from '../middleware/auditLogger';
import { decryptField, encryptField } from '../crypto';
import { upload, securityScan } from '../middleware/fileUpload';
import fs from 'fs';
import logger from '../logger';

const router = Router();

const CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  prescription: 'Prescription',
  bill: 'Bill',
  timetable: 'Timetable',
  explanation: 'Explanation',
};

function requireVerifiedDoctor(req: Request, res: Response, next: Function) {
  if (req.user?.role !== 'doctor') return next();
  if (!(req.user as any).is_verified) {
    res.status(403).json({ error: 'Account pending verification. Please wait for admin approval.' });
    return;
  }
  next();
}

async function decryptPatientInfo(row: any) {
  return {
    id: row.id,
    user_id: row.user_id,
    first_name: row.encrypted_first_name ? await decryptField(row.encrypted_first_name) : null,
    last_name: row.encrypted_last_name ? await decryptField(row.encrypted_last_name) : null,
    dob: row.encrypted_dob ? await decryptField(row.encrypted_dob) : null,
    phone: row.encrypted_phone ? await decryptField(row.encrypted_phone) : null,
    address: row.encrypted_address ? await decryptField(row.encrypted_address) : null,
    national_id: row.encrypted_national_id ? await decryptField(row.encrypted_national_id) : null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function decryptRecord(row: any) {
  return {
    id: row.id,
    patient_id: row.patient_id,
    hospital_id: row.hospital_id,
    doctor_id: row.doctor_id,
    source: row.source,
    category: row.category || 'general',
    title: row.encrypted_title ? await decryptField(row.encrypted_title) : null,
    description: row.encrypted_description ? await decryptField(row.encrypted_description) : null,
    file_path: row.encrypted_file_path ? await decryptField(row.encrypted_file_path) : null,
    file_hash: row.encrypted_file_hash ? await decryptField(row.encrypted_file_hash) : null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function checkActiveConsent(patientId: string, doctorId: string): Promise<{ exists: boolean; scoped_access: string }> {
  const result = await query(
    `SELECT scoped_access FROM consents
     WHERE patient_id = $1 AND doctor_id = $2 AND status = 'active' AND expires_at > CURRENT_TIMESTAMP`,
    [patientId, doctorId]
  );

  if (!result.rows.length) {
    return { exists: false, scoped_access: '' };
  }

  return { exists: true, scoped_access: result.rows[0].scoped_access };
}

// --- Doctor Profile Routes ---

// Get own profile + verification status
router.get('/profile', authenticate, authorize('doctor'), async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT dp.*, u.is_verified
       FROM doctor_profiles dp
       JOIN users u ON u.id = dp.user_id
       WHERE dp.user_id = $1`,
      [req.user!.id]
    );

    if (!result.rows.length) {
      res.status(404).json({ error: 'Profile not found. Please complete your profile.' });
      return;
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, 'Get doctor profile error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create or update profile
router.put('/profile', authenticate, authorize('doctor'),
  upload.array('certificates', 5),
  async (req: Request, res: Response) => {
    try {
      const { full_name, hospital_name, hospital_address, license_number, phone, availability } = req.body;

      if (!full_name || !hospital_name) {
        res.status(400).json({ error: 'Full name and hospital name are required' });
        return;
      }

      let certPaths: string[] = [];
      let newCertsUploaded = false;
      if (req.files && Array.isArray(req.files)) {
        certPaths = req.files.map((f: Express.Multer.File) => f.path);
        newCertsUploaded = certPaths.length > 0;
      }

      const result = await query(
        `INSERT INTO doctor_profiles (user_id, full_name, hospital_name, hospital_address, license_number, phone, certificates, availability, verification_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
         ON CONFLICT (user_id)
         DO UPDATE SET
           full_name = EXCLUDED.full_name,
           hospital_name = EXCLUDED.hospital_name,
           hospital_address = EXCLUDED.hospital_address,
           license_number = EXCLUDED.license_number,
           phone = EXCLUDED.phone,
           certificates = ARRAY(SELECT DISTINCT unnest(doctor_profiles.certificates || EXCLUDED.certificates)),
           availability = EXCLUDED.availability,
           verification_status = CASE
             WHEN doctor_profiles.verification_status = 'approved' THEN 'approved'
             ELSE 'pending'
           END
         RETURNING *`,
        [req.user!.id, full_name, hospital_name, hospital_address || null, license_number || null, phone || null, certPaths, availability || null]
      );

      if (newCertsUploaded) {
        await query(
          `INSERT INTO notifications (user_id, title, message)
           VALUES ($1, 'Certificates Uploaded', 'Your certificates have been uploaded and will be visible to patients when you request consent.')`,
          [req.user!.id]
        );
      }

      res.status(200).json({
        message: 'Profile saved',
        profile: result.rows[0]
      });
    } catch (err) {
      logger.error({ err }, 'Save doctor profile error');
      res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Patient Access Routes (require verified doctor) ---

router.get('/patients', authenticate, authorize('doctor'), requireVerifiedDoctor, async (req: Request, res: Response) => {
  try {
    const searchTerm = req.query.q as string || '';

    const result = await query(
      `SELECT p.*, u.username, u.email
       FROM patients p
       JOIN users u ON p.user_id = u.id
       WHERE u.role = 'patient'
       ORDER BY p.created_at DESC`
    );

    const decrypted = await Promise.all(result.rows.map(async (row: any) => {
      try {
        const info = await decryptPatientInfo(row);
        const consent = await checkActiveConsent(info.id, req.user!.id);
        return {
          id: info.id,
          user_id: info.user_id,
          first_name: info.first_name,
          last_name: info.last_name,
          national_id: info.national_id,
          dob: info.dob,
          has_consent: consent.exists
        };
      } catch {
        return null;
      }
    }));

    const filtered = searchTerm
      ? decrypted.filter(p => p && (
          (p.first_name && p.first_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (p.last_name && p.last_name.toLowerCase().includes(searchTerm.toLowerCase()))
        ))
      : decrypted;

    res.status(200).json(filtered.filter(Boolean));
  } catch (err) {
    logger.error({ err }, 'Patient search error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/patients/:patientId/profile', authenticate, authorize('doctor'), requireVerifiedDoctor, async (req: Request, res: Response) => {
  try {
    const result = await query('SELECT * FROM patients WHERE id = $1', [req.params.patientId]);
    if (!result.rows.length) {
      res.status(404).json({ error: 'Patient not found' });
      return;
    }
    const info = await decryptPatientInfo(result.rows[0]);
    res.status(200).json(info);
  } catch (err) {
    logger.error({ err }, 'Fetch patient profile error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/patients/:patientId/records', authenticate, authorize('doctor'), requireVerifiedDoctor,
  async (req: Request, res: Response) => {
    try {
      const result = await query(
        `SELECT r.*,
                CASE WHEN r.source = 'patient_upload' THEN 'patient' ELSE 'doctor' END AS source_label
         FROM records r
         WHERE r.patient_id = $1 AND (
           r.doctor_id = $2
           OR
           r.id IN (
             SELECT crp.record_id FROM consent_record_permissions crp
             JOIN consents c ON c.id = crp.consent_id
             WHERE c.patient_id = $1 AND c.doctor_id = $2 AND c.status = 'active' AND crp.visible = true
             AND c.expires_at > CURRENT_TIMESTAMP
           )
         )
         ORDER BY r.created_at DESC`,
        [req.params.patientId, req.user!.id]
      );

      const decrypted = await Promise.all(result.rows.map(decryptRecord));

      await insertAuditLog(
        req.user!.id,
        'DOCTOR_VIEWED_RECORDS',
        req.params.patientId,
        req.ip || 'unknown',
        req.get('User-Agent') || 'unknown'
      );

      // Log per-record access
      if (decrypted.length > 0) {
        const values = decrypted.map((_: any, i: number) =>
          `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`
        ).join(',');
        const params: any[] = [];
        for (const r of decrypted) {
          params.push(r.id, req.user!.id, req.params.patientId);
        }
        await query(
          `INSERT INTO record_access_log (record_id, doctor_id, patient_id) VALUES ${values}`,
          params
        );
      }

      res.status(200).json(decrypted);
    } catch (err) {
      logger.error({ err }, 'View patient records error');
      res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/patients/:patientId/records/:recordId/file', authenticate, authorize('doctor'), requireVerifiedDoctor,
  async (req: Request, res: Response) => {
    try {
      const { patientId, recordId } = req.params;

      const recordResult = await query(
        `SELECT r.encrypted_file_path FROM records r
         WHERE r.id = $1 AND r.patient_id = $2 AND (
           r.doctor_id = $3
           OR
           r.id IN (
             SELECT crp.record_id FROM consent_record_permissions crp
             JOIN consents c ON c.id = crp.consent_id
             WHERE c.patient_id = $2 AND c.doctor_id = $3 AND c.status = 'active' AND crp.visible = true
             AND c.expires_at > CURRENT_TIMESTAMP
           )
         )`,
        [recordId, patientId, req.user!.id]
      );

      if (!recordResult.rows.length || !recordResult.rows[0].encrypted_file_path) {
        res.status(404).json({ error: 'File not found or access denied' });
        return;
      }

      const decryptedPath = await decryptField(recordResult.rows[0].encrypted_file_path);

      if (!fs.existsSync(decryptedPath)) {
        res.status(404).json({ error: 'File not found on storage' });
        return;
      }

      await insertAuditLog(
        req.user!.id,
        'DOCTOR_VIEWED_FILE',
        patientId,
        req.ip || 'unknown',
        req.get('User-Agent') || 'unknown'
      );

      res.sendFile(decryptedPath);
    } catch (err) {
      logger.error({ err }, 'Doctor download file error');
      res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/patients/:patientId/records', authenticate, authorize('doctor'), requireVerifiedDoctor,
  auditLog('DOCTOR_ENTERED_RECORD'),
  async (req: Request, res: Response) => {
    try {
      const { title, description, category } = req.body;

      if (!title || !description) {
        res.status(400).json({ error: 'Title and description are required' });
        return;
      }

      const validCategories = ['general', 'prescription', 'bill', 'timetable', 'explanation'];
      const recordCategory = category && validCategories.includes(category) ? category : 'general';

      const consent = await checkActiveConsent(req.params.patientId, req.user!.id);

      if (!consent.exists) {
        res.status(403).json({ error: 'No active consent from this patient' });
        return;
      }

      if (consent.scoped_access !== 'all') {
        res.status(403).json({ error: 'Consent scope does not allow record entry' });
        return;
      }

      const sanitizedTitle = sanitizeInput(title);
      const sanitizedDesc = sanitizeInput(description);

      const encTitle = await encryptField(sanitizedTitle);
      const encDescription = await encryptField(sanitizedDesc);

      const result = await query(
        `INSERT INTO records (patient_id, doctor_id, source, category, encrypted_title, encrypted_description)
         VALUES ($1, $2, 'doctor_entry', $3, $4, $5)
         RETURNING id, source, category, created_at`,
        [req.params.patientId, req.user!.id, recordCategory, encTitle, encDescription]
      );

      // Notify patient
      const patientUser = await query(
        'SELECT user_id FROM patients WHERE id = $1',
        [req.params.patientId]
      );
      if (patientUser.rows.length) {
        const docProfile = await query(
          'SELECT full_name FROM doctor_profiles WHERE user_id = $1',
          [req.user!.id]
        );
        const docName = docProfile.rows[0]?.full_name || 'Your doctor';
        const catLabel = CATEGORY_LABELS[recordCategory] || recordCategory;
        await query(
          `INSERT INTO notifications (user_id, title, message, link)
           VALUES ($1, 'New ${catLabel} from Doctor', $2, '/dashboard?tab=records')`,
          [patientUser.rows[0].user_id,
           `${docName} added a new ${catLabel.toLowerCase()} record: ${sanitizedTitle}`]
        );
      }

      res.status(201).json({
        message: 'Record entered successfully',
        record: result.rows[0]
      });
    } catch (err) {
      logger.error({ err }, 'Enter record error');
      res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/patients/:patientId/upload', authenticate, authorize('doctor'), requireVerifiedDoctor,
  upload.single('file'),
  securityScan,
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const { title, description, category } = req.body;

      if (!title || !description) {
        fs.unlinkSync(file.path);
        res.status(400).json({ error: 'Title and description are required' });
        return;
      }

      const validCategories = ['general', 'prescription', 'bill', 'timetable', 'explanation'];
      const recordCategory = category && validCategories.includes(category) ? category : 'general';

      const consent = await checkActiveConsent(req.params.patientId, req.user!.id);

      if (!consent.exists) {
        fs.unlinkSync(file.path);
        res.status(403).json({ error: 'No active consent from this patient' });
        return;
      }

      if (consent.scoped_access !== 'all') {
        fs.unlinkSync(file.path);
        res.status(403).json({ error: 'Consent scope does not allow file upload' });
        return;
      }

      const sanitizedTitle = sanitizeInput(title);
      const sanitizedDesc = sanitizeInput(description);

      const encTitle = await encryptField(sanitizedTitle);
      const encDescription = await encryptField(sanitizedDesc);
      const encPath = await encryptField(file.path);
      const encHash = await encryptField(file.filename);

      const result = await query(
        `INSERT INTO records (patient_id, doctor_id, source, category, encrypted_title, encrypted_description, encrypted_file_path, encrypted_file_hash)
         VALUES ($1, $2, 'doctor_upload', $3, $4, $5, $6, $7)
         RETURNING id, source, category, created_at`,
        [req.params.patientId, req.user!.id, recordCategory, encTitle, encDescription, encPath, encHash]
      );

      await insertAuditLog(
        req.user!.id,
        'DOCTOR_UPLOADED_FILE',
        req.params.patientId,
        req.ip || 'unknown',
        req.get('User-Agent') || 'unknown'
      );

      // Notify patient
      const patientUser = await query(
        'SELECT user_id FROM patients WHERE id = $1',
        [req.params.patientId]
      );
      if (patientUser.rows.length) {
        const docProfile = await query(
          'SELECT full_name FROM doctor_profiles WHERE user_id = $1',
          [req.user!.id]
        );
        const docName = docProfile.rows[0]?.full_name || 'Your doctor';
        const catLabel = CATEGORY_LABELS[recordCategory] || recordCategory;
        await query(
          `INSERT INTO notifications (user_id, title, message, link)
           VALUES ($1, 'New ${catLabel} File from Doctor', $2, '/dashboard?tab=records')`,
          [patientUser.rows[0].user_id,
           `${docName} uploaded a new ${catLabel.toLowerCase()} file: ${sanitizedTitle}`]
        );
      }

      res.status(201).json({
        message: 'File uploaded successfully',
        record: result.rows[0],
        file: {
          originalName: file.originalname,
          size: file.size,
        }
      });
    } catch (err) {
      try { if (req.file) fs.unlinkSync(req.file.path); } catch {}
      logger.error({ err }, 'Doctor file upload error');
      res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/emergency-override', authenticate, authorize('doctor'), requireVerifiedDoctor,
  auditLog('EMERGENCY_OVERRIDE'),
  async (req: Request, res: Response) => {
    try {
      const { patient_id, reason } = req.body;

      if (!patient_id || !reason) {
        res.status(400).json({ error: 'patient_id and reason are required' });
        return;
      }

      if (reason.length < 20) {
        res.status(400).json({ error: 'Override reason must be at least 20 characters' });
        return;
      }

      const patientResult = await query(
        'SELECT id FROM patients WHERE id = $1',
        [patient_id]
      );

      if (!patientResult.rows.length) {
        res.status(404).json({ error: 'Patient not found' });
        return;
      }

      const result = await query(
        `SELECT r.* FROM records r
         WHERE r.patient_id = $1
         ORDER BY r.created_at DESC`,
        [patient_id]
      );

      await insertAuditLog(
        req.user!.id,
        'EMERGENCY_OVERRIDE',
        patient_id,
        req.ip || 'unknown',
        req.get('User-Agent') || 'unknown',
        reason
      );

      const patientUser = await query(
        'SELECT user_id FROM patients WHERE id = $1',
        [patient_id]
      );
      if (patientUser.rows.length) {
        await query(
          `INSERT INTO notifications (user_id, title, message)
           VALUES ($1, 'Emergency Override', $2)`,
          [patientUser.rows[0].user_id,
           `A doctor performed an emergency override on your records. Reason: ${reason}`]
        );
      }

      const decrypted = await Promise.all(result.rows.map(decryptRecord));

      // Log per-record access
      if (decrypted.length > 0) {
        const values = decrypted.map((_: any, i: number) =>
          `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`
        ).join(',');
        const params: any[] = [];
        for (const r of decrypted) {
          params.push(r.id, req.user!.id, patient_id);
        }
        await query(
          `INSERT INTO record_access_log (record_id, doctor_id, patient_id) VALUES ${values}`,
          params
        );
      }

      res.status(200).json({
        message: 'Emergency override granted',
        override_reason: reason,
        records: decrypted
      });
    } catch (err) {
      logger.error({ err }, 'Emergency override error');
      res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Consent Request (Doctor → Patient) ---
router.post('/consent-request/:patientId', authenticate, authorize('doctor'), requireVerifiedDoctor, async (req: Request, res: Response) => {
  try {
    const doctorId = req.user!.id;
    const patientId = req.params.patientId;

    const existing = await query(
      `SELECT id, status FROM consents
       WHERE patient_id = $1 AND doctor_id = $2 AND status IN ('active', 'pending')`,
      [patientId, doctorId]
    );

    if (existing.rows.length) {
      res.status(409).json({ error: 'A consent request already exists for this patient' });
      return;
    }

    const result = await query(
      `INSERT INTO consents (patient_id, doctor_id, scoped_access, status, expires_at)
       VALUES ($1, $2, 'all', 'pending', CURRENT_TIMESTAMP + INTERVAL '30 days')
       RETURNING id`,
      [patientId, doctorId]
    );

    const patientUser = await query(
      'SELECT user_id FROM patients WHERE id = $1',
      [patientId]
    );

    if (patientUser.rows.length) {
      const docProfile = await query(
        'SELECT full_name, hospital_name FROM doctor_profiles WHERE user_id = $1',
        [doctorId]
      );
      const docName = docProfile.rows[0]?.full_name || 'A doctor';
      await query(
        `INSERT INTO notifications (user_id, title, message, link)
         VALUES ($1, 'New Consent Request', $2, '/dashboard?tab=consents')`,
        [patientUser.rows[0].user_id,
         `${docName} (${docProfile.rows[0]?.hospital_name || ''}) has requested access to your records.`]
      );
    }

    await insertAuditLog(doctorId, 'CONSENT_REQUESTED', patientId, req.ip || 'unknown', req.get('User-Agent') || 'unknown');

    res.status(201).json({ message: 'Consent request sent to patient', consent_id: result.rows[0].id });
  } catch (err) {
    logger.error({ err }, 'Consent request error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check consent status for a patient
router.get('/patient/:patientId/consent-status', authenticate, authorize('doctor'), async (req: Request, res: Response) => {
  try {
    const consent = await checkActiveConsent(req.params.patientId, req.user!.id);
    res.status(200).json({ has_consent: consent.exists, scoped_access: consent.scoped_access });
  } catch (err) {
    logger.error({ err }, 'Consent status error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get full doctor details for consent request page
router.get('/:doctorId/details', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT dp.full_name, dp.hospital_name, dp.hospital_address, dp.license_number, dp.availability,
              u.email, u.username
       FROM doctor_profiles dp
       JOIN users u ON u.id = dp.user_id
       WHERE dp.user_id = $1 AND dp.verification_status = 'approved'`,
      [req.params.doctorId]
    );

    if (!result.rows.length) {
      res.status(404).json({ error: 'Doctor not found' });
      return;
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, 'Doctor details error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Public Doctor Directory (for patients to browse) ---
router.get('/directory', authenticate, async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT dp.id, dp.full_name, dp.hospital_name, dp.hospital_address, dp.availability, u.username
       FROM doctor_profiles dp
       JOIN users u ON u.id = dp.user_id
       WHERE dp.verification_status = 'approved' AND u.active = true
       ORDER BY dp.full_name ASC`
    );

    res.status(200).json(result.rows);
  } catch (err) {
    logger.error({ err }, 'Doctor directory error');
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

export default router;
