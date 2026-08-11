import { Router, Response } from 'express';
import pool from '../db';
import { HospitalRequest } from '../middleware/hospitalAuth';
import { matchPatient, FHIRPatientExtract, validateNid } from '../hospital/patientMatcher';
import { encryptForPatient, encryptPatientField, generatePatientSalt, derivePatientKey } from '../crypto';
import { createHash } from 'crypto';
import { insertHospitalAuditLog } from '../hospital/auditLog';
import { sendTempPasswordEmail, sendHospitalRecordsEmail } from '../email';
import { generateTempPassword } from '../auth/password';

const router = Router();

function extractPatient(fhirPatient: any): FHIRPatientExtract {
  const name = fhirPatient.name?.[0];
  const fullName = [
    name?.given?.join(' '),
    name?.family
  ].filter(Boolean).join(' ');

  const nid = fhirPatient.identifier?.find(
    (i: any) => i.system?.includes('national-id') || i.type?.text === 'NID'
  )?.value;

  return {
    hospitalLocalId: fhirPatient.id,
    nid,
    fullName,
    dateOfBirth: fhirPatient.birthDate,
    gender: fhirPatient.gender,
  };
}

function hashNid(nid: string): string {
  return createHash('sha256').update(nid.trim().toUpperCase()).digest('hex');
}

// Extract e-mail from FHIR telecom so a login can be provisioned
function extractEmail(fhirPatient: any): string | undefined {
  return fhirPatient.telecom?.find((t: any) => t.system === 'email')?.value;
}

async function insertClinicalRecords(
  client: any,
  chdsPatientId: string,
  hospitalId: string,
  entries: any[]
): Promise<number> {
  let inserted = 0;
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
    const description = JSON.stringify(resource);

    const encTitle = await encryptForPatient(chdsPatientId, title);
    const encDesc = await encryptForPatient(chdsPatientId, description);

    await client.query(
      `INSERT INTO records
         (patient_id, hospital_id, doctor_id, source, category, encrypted_title, encrypted_description, created_at)
       VALUES ($1, $2, NULL, 'hospital_push', $3, $4, $5, NOW())`,
      [chdsPatientId, hospitalId, category, encTitle, encDesc]
    );
    inserted++;
  }
  return inserted;
}

// Create a patient login user for a brand-new (create_new) patient.
// Requires an email: falls back to a generated placeholder if absent.
async function createPatientLoginUser(
  patientData: FHIRPatientExtract,
  email?: string
): Promise<{ userId: string; tempPassword: string; emailed: boolean }> {
  const tempPassword = generateTempPassword();
  const username = 'hospital_' + createHash('sha256')
    .update(`${patientData.hospitalLocalId}_${Date.now()}`).digest('hex').slice(0, 12);
  const finalEmail = email || `${username}@chds.np`;

  const { rows } = await pool.query(
    `INSERT INTO users (username, email, password_hash, role, active, onboarding_complete, must_change_password, is_verified)
     VALUES ($1, $2, crypt($3, gen_salt('bf', 12)), 'patient', true, true, true, false)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id`,
    [username, finalEmail, tempPassword]
  );

  let emailed = false;
  if (email) {
    try {
      await sendTempPasswordEmail(email, tempPassword);
      emailed = true;
    } catch (err) {
      console.warn('Temp password email failed (non-fatal):', (err as Error).message);
    }
  }

  return { userId: rows[0].id, tempPassword, emailed };
}

router.post('/ingest', async (req: HospitalRequest, res: Response) => {
  const hospital = req.hospital!;
  const bundle = req.body;
  const startTime = Date.now();

  if (!bundle || bundle.resourceType !== 'Bundle') {
    return res.status(400).json({ error: 'Body must be a FHIR R4 Bundle' });
  }

  const entries: any[] = bundle.entry || [];
  const patientEntry = entries.find(e => e.resource?.resourceType === 'Patient');

  if (!patientEntry) {
    return res.status(400).json({ error: 'Bundle must contain a Patient resource' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const patientData = extractPatient(patientEntry.resource);

    if (!patientData.fullName || !patientData.dateOfBirth) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Patient must have name and birthDate' });
    }

    // Validate NID format if present (Nepal NID = 16-digit numeric)
    let nidValid = true;
    let nidError: string | undefined;
    if (patientData.nid) {
      const validation = validateNid(patientData.nid);
      nidValid = validation.valid;
      nidError = validation.error;
    }

    const matchResult = await matchPatient(patientData);

    let chdsPatientId: string;
    let createdLogin: { userId: string; tempPassword: string; emailed: boolean } | null = null;

    if (matchResult.action === 'create_new') {
      const salt = generatePatientSalt();
      const patientKey = derivePatientKey(salt).toString('base64');
      const encFirstName = await encryptPatientField(patientData.fullName.split(' ').slice(0, -1).join(' ') || patientData.fullName, patientKey);
      const encLastName = await encryptPatientField(patientData.fullName.split(' ').pop() || '', patientKey);
      const encDob = await encryptPatientField(patientData.dateOfBirth, patientKey);

      const { rows: newPatient } = await client.query(
        `INSERT INTO patients
           (enc_key_salt, encrypted_first_name, encrypted_last_name, encrypted_dob,
            full_name, date_of_birth, gender,
            encrypted_national_id, nid_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          salt, encFirstName, encLastName, encDob,
          patientData.fullName, patientData.dateOfBirth, patientData.gender,
          patientData.nid ? await encryptPatientField(patientData.nid, patientKey) : null,
          patientData.nid && nidValid ? hashNid(patientData.nid) : null,
        ]
      );
      chdsPatientId = newPatient[0].id;

      // Provision a patient login so they can access their dashboard
      createdLogin = await createPatientLoginUser(patientData, extractEmail(patientEntry.resource));
      await client.query(
        `UPDATE patients SET user_id = $1 WHERE id = $2`,
        [createdLogin.userId, chdsPatientId]
      );
    } else {
      chdsPatientId = matchResult.chdsPatientId!;
    }

    const linkStatus = matchResult.action === 'pending_review'
      ? 'pending_review'
      : 'confirmed';

    // For pending review, HOLD the clinical bundle in the link for QA confirm/reject
    const clinicalEntries = entries.filter(e => e.resource?.resourceType !== 'Patient');
    const pendingBundle = matchResult.action === 'pending_review'
      ? JSON.stringify(clinicalEntries)
      : null;

    await client.query(
      `INSERT INTO hospital_patient_links
         (chds_patient_id, hospital_id, hospital_local_id, match_method, match_confidence, status, pending_bundle, pending_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (hospital_id, hospital_local_id) DO UPDATE
         SET match_confidence = EXCLUDED.match_confidence,
             status = EXCLUDED.status,
             pending_bundle = EXCLUDED.pending_bundle,
             pending_reason = EXCLUDED.pending_reason`,
      [
        chdsPatientId,
        hospital.id,
        patientData.hospitalLocalId,
        matchResult.matchMethod || 'composite',
        matchResult.confidence,
        linkStatus,
        pendingBundle,
        matchResult.reason || null,
      ]
    );

    // Auto-create hospital consent on first ingest (patient→hospital)
    await client.query(
      `INSERT INTO hospital_consents (patient_id, hospital_id, status, data_share_level)
       VALUES ($1, $2, 'active', 'full')
       ON CONFLICT (patient_id, hospital_id) DO NOTHING`,
      [chdsPatientId, hospital.id]
    );

    let recordsInserted = 0;

    if (matchResult.action !== 'pending_review') {
      recordsInserted = await insertClinicalRecords(client, chdsPatientId, hospital.id, clinicalEntries);
    }

    // Audit log (existing system)
    await client.query(
      `INSERT INTO audit_log (actor_id, action, target_id, ip_address, user_agent)
       VALUES (NULL, $1, $2, $3, $4)`,
      [
        'HOSPITAL_INGEST',
        chdsPatientId,
        req.ip || 'unknown',
        `hospital_id:${hospital.id}:${hospital.name}:${patientData.hospitalLocalId}`
      ]
    );

    await client.query('COMMIT');

    // Notify existing patients (auto-link / confirmed) that a hospital pushed new records
    if (matchResult.action !== 'pending_review' && recordsInserted > 0 && matchResult.chdsPatientId) {
      try {
        const { rows: pRows } = await pool.query(
          `SELECT u.email, u.username
           FROM patients p
           JOIN users u ON u.id = p.user_id
           WHERE p.id = $1 AND u.email NOT ILIKE 'hospital_%@chds.np'`,
          [matchResult.chdsPatientId]
        );
        const patientEmail = pRows[0]?.email;
        if (patientEmail) {
          await sendHospitalRecordsEmail(patientEmail, hospital.name, recordsInserted);
        }
      } catch (emailErr) {
        console.warn('Hospital records email failed (non-fatal):', (emailErr as Error).message);
      }
    }

    // HIPAA-grade hospital audit log (after successful commit)
    try {
      await insertHospitalAuditLog({
        hospitalId: hospital.id,
        eventType: 'ingest',
        actorType: 'hospital',
        actorId: hospital.id,
        targetType: 'patient',
        targetId: chdsPatientId,
        outcome: 'success',
        details: {
          match_action: matchResult.action,
          match_method: matchResult.matchMethod,
          confidence: matchResult.confidence,
          records_inserted: recordsInserted,
          records_held: matchResult.action === 'pending_review' ? clinicalEntries.length : 0,
          hospital_local_id: patientData.hospitalLocalId,
          nid_provided: !!patientData.nid,
          nid_valid: nidValid,
          nid_error: nidError,
          requires_evidence: !!matchResult.requiresEvidence,
          match_reason: matchResult.reason,
          processing_time_ms: Date.now() - startTime
        },
        ipAddress: req.ip,
      });
    } catch (auditErr) {
      console.error('Failed to write hospital audit log (non-fatal):', auditErr);
    }

    return res.status(200).json({
      success: true,
      chds_patient_id: chdsPatientId,
      match_action: matchResult.action,
      match_method: matchResult.matchMethod || null,
      confidence: matchResult.confidence,
      records_inserted: recordsInserted,
      nid_valid: nidValid,
      nid_error: nidError,
      requires_evidence: !!matchResult.requiresEvidence,
      match_reason: matchResult.reason || null,
      login_provisioned: createdLogin ? {
        email: extractEmail(patientEntry.resource) || null,
        emailed: createdLogin.emailed,
      } : null,
      temp_password: createdLogin ? createdLogin.tempPassword : undefined,
      message: matchResult.action === 'pending_review'
        ? 'Patient match is uncertain. Records held pending admin review with evidence.'
        : `Ingest successful. ${recordsInserted} record(s) added.`
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Ingest error:', err);

    // Log failure to HIPAA audit
    try {
      await insertHospitalAuditLog({
        hospitalId: hospital.id,
        eventType: 'ingest',
        actorType: 'hospital',
        actorId: hospital.id,
        targetType: 'patient',
        targetId: undefined,
        outcome: 'failure',
        details: {
          error: (err as Error).message,
          hospital_local_id: extractPatient(patientEntry.resource).hospitalLocalId,
          processing_time_ms: Date.now() - startTime
        },
        ipAddress: req.ip,
      });
    } catch {}

    return res.status(500).json({ error: 'Ingest failed. Transaction rolled back.' });
  } finally {
    client.release();
  }
});

export default router;