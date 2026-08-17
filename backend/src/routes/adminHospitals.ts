import { Router, Request, Response } from 'express';
import pool, { query } from '../db';
import { authenticate, authorize } from '../middleware/authorize';
import { randomBytes } from 'crypto';
import bcrypt from 'bcrypt';
import { insertHospitalAuditLog } from '../hospital/auditLog';
import { encryptForPatient } from '../crypto';
import { getGraceHours } from '../middleware/hospitalAuth';

const router = Router();
const BCRYPT_COST = 12;

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
  const keyHash = await bcrypt.hash(plainKey, BCRYPT_COST);

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
  const keyHash = await bcrypt.hash(plainKey, BCRYPT_COST);

  const { rows: current } = await query(
    'SELECT api_key_hash FROM hospitals WHERE id = $1',
    [req.params.id]
  );
  if (current.length === 0) return res.status(404).json({ error: 'Hospital not found' });

  const graceH = getGraceHours();

  // Keep the old key valid for a grace period so the hospital can update
  // their config without downtime. After the window it no longer authenticates.
  const { rows } = await query(
    `UPDATE hospitals
     SET api_key_hash = $1,
         api_key_previous_hash = CASE
           WHEN api_key_previous_expires_at > CURRENT_TIMESTAMP AND api_key_previous_hash IS NOT NULL
             THEN api_key_previous_hash
           ELSE api_key_hash
         END,
         api_key_previous_expires_at = CURRENT_TIMESTAMP + ($3::int || ' hours')::interval
     WHERE id = $2
     RETURNING id, name`,
    [keyHash, req.params.id, graceH]
  );

  await insertHospitalAuditLog({
    hospitalId: rows[0].id,
    eventType: 'api_key_regen',
    actorType: 'admin',
    actorId: req.user!.id,
    targetType: 'hospital',
    targetId: rows[0].id,
    outcome: 'success',
    details: { key_regenerated: true, grace_period_hours: graceH },
    ipAddress: req.ip,
  });

  return res.json({
    hospital: rows[0],
    api_key: plainKey,
    grace_period_hours: graceH,
    message: `New key issued. Previous key remains valid for ${graceH} hour(s) to avoid downtime. Copy this new key: it will not be shown again.`
  });
});

// Alias: rotate-key is the canonical rotation endpoint (same semantics).
router.post('/:id/rotate-key', authenticate, authorize('admin'), async (req: Request, res: Response) => {
  const plainKey = randomBytes(32).toString('hex');
  const keyHash = await bcrypt.hash(plainKey, BCRYPT_COST);

  const { rows: current } = await query(
    'SELECT api_key_hash FROM hospitals WHERE id = $1',
    [req.params.id]
  );
  if (current.length === 0) return res.status(404).json({ error: 'Hospital not found' });

  const graceH = getGraceHours();

  const { rows } = await query(
    `UPDATE hospitals
     SET api_key_hash = $1,
         api_key_previous_hash = CASE
           WHEN api_key_previous_expires_at > CURRENT_TIMESTAMP AND api_key_previous_hash IS NOT NULL
             THEN api_key_previous_hash
           ELSE api_key_hash
         END,
         api_key_previous_expires_at = CURRENT_TIMESTAMP + ($3::int || ' hours')::interval
     WHERE id = $2
     RETURNING id, name`,
    [keyHash, req.params.id, graceH]
  );

  await insertHospitalAuditLog({
    hospitalId: rows[0].id,
    eventType: 'api_key_regen',
    actorType: 'admin',
    actorId: req.user!.id,
    targetType: 'hospital',
    targetId: rows[0].id,
    outcome: 'success',
    details: { key_rotated: true, grace_period_hours: graceH },
    ipAddress: req.ip,
  });

  return res.json({
    hospital: rows[0],
    api_key: plainKey,
    grace_period_hours: graceH,
    message: `API key rotated. Previous key remains valid for ${graceH} hour(s). Copy this new key: it will not be shown again.`
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

  // Fetch link details for audit log + held bundle
  const { rows: linkRows } = await query(
    `SELECT hpl.id, hpl.chds_patient_id, hpl.hospital_id, hpl.match_method,
            hpl.match_confidence, hpl.pending_bundle, hpl.pending_reason, hpl.status,
            h.name AS hospital_name
     FROM hospital_patient_links hpl
     JOIN hospitals h ON h.id = hpl.hospital_id
     WHERE hpl.id = $1`,
    [req.params.linkId]
  );

  if (linkRows.length === 0) return res.status(404).json({ error: 'Match link not found' });
  const link = linkRows[0];

  if (action === 'confirm') {
    const evidence = (req.body.evidence || '').trim();
    if (!evidence) {
      return res.status(400).json({ error: 'Evidence is required to confirm a match (must verify the two records belong to the same person).' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Import any held clinical records from the pending bundle
      let recordsImported = 0;
      if (link.pending_bundle) {
        const entries: any[] = typeof link.pending_bundle === 'string'
          ? JSON.parse(link.pending_bundle)
          : link.pending_bundle;
        const categoryMap: Record<string, string> = {
          Observation:        'general',
          DiagnosticReport:   'general',
          Condition:          'general',
          MedicationRequest:  'prescription',
        };
        for (const entry of entries) {
          const resource = entry.resource;
          if (!resource) continue;
          const category = categoryMap[resource.resourceType] || 'general';
          const title = `${resource.resourceType}: ${resource.code?.coding?.[0]?.display || resource.code?.text || resource.resourceType}`;
          const encTitle = await encryptForPatient(link.chds_patient_id, title);
          const encDesc = await encryptForPatient(link.chds_patient_id, JSON.stringify(resource));
          await client.query(
            `INSERT INTO records
               (patient_id, hospital_id, doctor_id, source, category, encrypted_title, encrypted_description, created_at)
             VALUES ($1, $2, NULL, 'hospital_push', $3, $4, $5, NOW())`,
            [link.chds_patient_id, link.hospital_id, category, encTitle, encDesc]
          );
          recordsImported++;
        }
      }

      await client.query(
        `UPDATE hospital_patient_links
         SET status = 'confirmed', match_method = 'admin_confirmed',
             evidence = $2, reviewed_by = $3, reviewed_at = NOW(),
             pending_bundle = NULL, pending_reason = NULL
         WHERE id = $1`,
        [req.params.linkId, evidence, req.user!.id]
      );

      await client.query('COMMIT');

      await insertHospitalAuditLog({
        hospitalId: link.hospital_id,
        eventType: 'match_confirm',
        actorType: 'admin',
        actorId: req.user!.id,
        targetType: 'link',
        targetId: req.params.linkId,
        outcome: 'success',
        details: {
          hospital_name: link.hospital_name,
          previous_method: link.match_method,
          previous_confidence: link.match_confidence,
          evidence,
          records_imported: recordsImported,
          pending_reason: link.pending_reason,
        },
        ipAddress: req.ip,
      });

      return res.json({ message: 'Match confirmed. Records will now be visible.', records_imported: recordsImported });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Confirm match error:', err);
      return res.status(500).json({ error: 'Failed to confirm match. Transaction rolled back.' });
    } finally {
      client.release();
    }
  }

  // Reject: discard the link and its held bundle (no records imported)
  await query(
    `DELETE FROM hospital_patient_links WHERE id = $1`,
    [req.params.linkId]
  );

  await insertHospitalAuditLog({
    hospitalId: link.hospital_id,
    eventType: 'match_reject',
    actorType: 'admin',
    actorId: req.user!.id,
    targetType: 'link',
    targetId: req.params.linkId,
    outcome: 'success',
    details: {
      hospital_name: link.hospital_name,
      previous_method: link.match_method,
      previous_confidence: link.match_confidence,
      pending_reason: link.pending_reason,
      records_discarded: link.pending_bundle ? (typeof link.pending_bundle === 'string' ? JSON.parse(link.pending_bundle) : link.pending_bundle).length : 0,
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
