import { Router, Request, Response } from 'express';
import { query } from '../db';
import { authenticate, authorize } from '../middleware/authorize';
import { randomBytes, createHash } from 'crypto';
import { insertHospitalAuditLog } from '../hospital/auditLog';

const router = Router();

router.get('/', authenticate, authorize('admin'), async (_req: Request, res: Response) => {
  const { rows } = await query(
    `SELECT
       h.id, h.name, h.address, h.contact_number, h.contact_email,
       h.software_type, h.status, h.created_at,
       h.terms_accepted_at, h.terms_version,
       COUNT(DISTINCT hpl.id)         AS linked_patients,
       COUNT(DISTINCT r.id)           AS total_records,
       MAX(r.created_at)              AS last_submission
     FROM hospitals h
     LEFT JOIN hospital_patient_links hpl ON hpl.hospital_id = h.id
     LEFT JOIN records r ON r.hospital_id = h.id AND r.source = 'hospital_push'
     GROUP BY h.id
     ORDER BY h.created_at DESC`
  );
  return res.json({ hospitals: rows });
});

router.post('/', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  const { name, address, contact_number, contact_email, software_type } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  const plainKey = randomBytes(32).toString('hex');
  const keyHash  = createHash('sha256').update(plainKey).digest('hex');

  const { rows } = await query(
    `INSERT INTO hospitals
       (name, address, contact_number, contact_email, software_type, api_key_hash, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING id, name, status, created_at`,
    [name, address, contact_number, contact_email, software_type, keyHash]
  );

  await insertHospitalAuditLog({
    hospitalId: rows[0].id,
    eventType: 'register',
    actorType: 'admin',
    actorId: req.user!.id,
    targetType: 'hospital',
    targetId: rows[0].id,
    outcome: 'success',
    details: { name, software_type, contact_email },
    ipAddress: req.ip,
  });

  return res.status(201).json({
    hospital: rows[0],
    api_key: plainKey,
    message: 'Copy this API key : it will not be shown again.'
  });
});

router.patch('/:id/status', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  const { status } = req.body;

  if (!['active','suspended','pending'].includes(status)) {
    return res.status(400).json({ error: 'status must be active | suspended | pending' });
  }

  // Check terms acceptance before activating
  if (status === 'active') {
    const { rows: check } = await query(
      `SELECT terms_accepted_at FROM hospitals WHERE id = $1`,
      [req.params.id]
    );
    if (check.length === 0) return res.status(404).json({ error: 'Hospital not found' });
    if (!check[0].terms_accepted_at) {
      return res.status(400).json({
        error: 'Hospital has not accepted the terms and conditions. They must accept via POST /api/v1/hospital/accept-terms before activation.'
      });
    }
  }

  const { rows } = await query(
    `UPDATE hospitals SET status = $1 WHERE id = $2 RETURNING id, name, status`,
    [status, req.params.id]
  );

  if (rows.length === 0) return res.status(404).json({ error: 'Hospital not found' });

  await insertHospitalAuditLog({
    hospitalId: rows[0].id,
    eventType: status === 'active' ? 'activate' : status === 'suspended' ? 'suspend' : 'register',
    actorType: 'admin',
    actorId: req.user!.id,
    targetType: 'hospital',
    targetId: rows[0].id,
    outcome: 'success',
    details: { new_status: status, previous_status: undefined },
    ipAddress: req.ip,
  });

  return res.json({ hospital: rows[0] });
});

router.post('/:id/regenerate-key', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  const plainKey = randomBytes(32).toString('hex');
  const keyHash  = createHash('sha256').update(plainKey).digest('hex');

  const { rows } = await query(
    `UPDATE hospitals SET api_key_hash = $1 WHERE id = $2
     RETURNING id, name`,
    [keyHash, req.params.id]
  );

  if (rows.length === 0) return res.status(404).json({ error: 'Hospital not found' });

  await insertHospitalAuditLog({
    hospitalId: rows[0].id,
    eventType: 'api_key_regen',
    actorType: 'admin',
    actorId: req.user!.id,
    targetType: 'hospital',
    targetId: rows[0].id,
    outcome: 'success',
    details: { key_regenerated: true },
    ipAddress: req.ip,
  });

  return res.json({
    hospital: rows[0],
    api_key: plainKey,
    message: 'Old key is now invalid. Copy this new key : it will not be shown again.'
  });
});

router.get('/matches', authenticate, authorize('admin'), async (_req: Request, res: Response) => {
  const { rows } = await query(
    `SELECT
       hpl.id               AS link_id,
       hpl.hospital_local_id,
       hpl.match_confidence,
       hpl.match_method,
       hpl.created_at,
       h.name               AS hospital_name,
       p.id                 AS candidate_patient_id,
       p.date_of_birth      AS candidate_dob,
       p.gender             AS candidate_gender
     FROM hospital_patient_links hpl
     JOIN hospitals h ON h.id = hpl.hospital_id
     JOIN patients  p ON p.id = hpl.chds_patient_id
     WHERE hpl.status = 'pending_review'
     ORDER BY hpl.created_at DESC`
  );
  return res.json({ pending_matches: rows });
});

router.post('/matches/:linkId/confirm', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  const { action } = req.body;

  if (!['confirm','reject'].includes(action)) {
    return res.status(400).json({ error: 'action must be confirm | reject' });
  }

  // Fetch link details for audit log
  const { rows: linkRows } = await query(
    `SELECT hpl.hospital_id, hpl.match_method, hpl.match_confidence,
            h.name AS hospital_name
     FROM hospital_patient_links hpl
     JOIN hospitals h ON h.id = hpl.hospital_id
     WHERE hpl.id = $1`,
    [req.params.linkId]
  );

  if (linkRows.length === 0) return res.status(404).json({ error: 'Match link not found' });

  if (action === 'confirm') {
    await query(
      `UPDATE hospital_patient_links
       SET status = 'confirmed', match_method = 'admin_confirmed'
       WHERE id = $1`,
      [req.params.linkId]
    );

    await insertHospitalAuditLog({
      hospitalId: linkRows[0].hospital_id,
      eventType: 'match_confirm',
      actorType: 'admin',
      actorId: req.user!.id,
      targetType: 'link',
      targetId: req.params.linkId,
      outcome: 'success',
      details: {
        hospital_name: linkRows[0].hospital_name,
        previous_method: linkRows[0].match_method,
        previous_confidence: linkRows[0].match_confidence
      },
      ipAddress: req.ip,
    });

    return res.json({ message: 'Match confirmed. Records will now be visible.' });
  }

  await query(
    `DELETE FROM hospital_patient_links WHERE id = $1`,
    [req.params.linkId]
  );

  await insertHospitalAuditLog({
    hospitalId: linkRows[0].hospital_id,
    eventType: 'match_reject',
    actorType: 'admin',
    actorId: req.user!.id,
    targetType: 'link',
    targetId: req.params.linkId,
    outcome: 'success',
    details: {
      hospital_name: linkRows[0].hospital_name,
      previous_method: linkRows[0].match_method,
      previous_confidence: linkRows[0].match_confidence
    },
    ipAddress: req.ip,
  });

  return res.json({ message: 'Match rejected. No records imported for this patient.' });
});

// ── GET /api/v1/admin/hospitals/:id/audit-log : HIPAA audit trail ──
router.get('/:id/audit-log', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  const { rows } = await query(
    `SELECT * FROM hospital_audit_log
     WHERE hospital_id = $1
     ORDER BY created_at DESC
     LIMIT 500`,
    [req.params.id]
  );
  return res.json({ audit_log: rows });
});

export default router;
