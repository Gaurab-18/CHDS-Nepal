import { Router, Response } from 'express';
import pool from '../db';
import { HospitalRequest } from '../middleware/hospitalAuth';
import { matchPatient, FHIRPatientExtract, validateNid } from '../hospital/patientMatcher';
import { encryptField } from '../crypto';
import { createHash } from 'crypto';
import { insertHospitalAuditLog } from '../hospital/auditLog';

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

    if (matchResult.action === 'create_new') {
      const encFirstName = await encryptField(patientData.fullName.split(' ').slice(0, -1).join(' ') || patientData.fullName);
      const encLastName = await encryptField(patientData.fullName.split(' ').pop() || '');
      const encDob = await encryptField(patientData.dateOfBirth);

      const { rows: newPatient } = await client.query(
        `INSERT INTO patients
           (encrypted_first_name, encrypted_last_name, encrypted_dob,
            full_name, date_of_birth, gender,
            encrypted_national_id, nid_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          encFirstName, encLastName, encDob,
          patientData.fullName, patientData.dateOfBirth, patientData.gender,
          patientData.nid ? await encryptField(patientData.nid) : null,
          patientData.nid && nidValid ? hashNid(patientData.nid) : null,
        ]
      );
      chdsPatientId = newPatient[0].id;
    } else {
      chdsPatientId = matchResult.chdsPatientId!;
    }

    const linkStatus = matchResult.action === 'pending_review'
      ? 'pending_review'
      : 'confirmed';

    await client.query(
      `INSERT INTO hospital_patient_links
         (chds_patient_id, hospital_id, hospital_local_id, match_method, match_confidence, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (hospital_id, hospital_local_id) DO UPDATE
         SET match_confidence = EXCLUDED.match_confidence,
             status = EXCLUDED.status`,
      [
        chdsPatientId,
        hospital.id,
        patientData.hospitalLocalId,
        matchResult.matchMethod || 'composite',
        matchResult.confidence,
        linkStatus
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
      const clinicalEntries = entries.filter(
        e => e.resource?.resourceType !== 'Patient'
      );

      for (const entry of clinicalEntries) {
        const resource = entry.resource;
        if (!resource) continue;

        const categoryMap: Record<string, string> = {
          Observation:        'general',
          DiagnosticReport:   'general',
          Condition:          'general',
          MedicationRequest:  'prescription',
        };

        const category = categoryMap[resource.resourceType] || 'general';
        const title = `${resource.resourceType}: ${resource.code?.coding?.[0]?.display || resource.code?.text || resource.resourceType}`;
        const description = JSON.stringify(resource);

        const encTitle = await encryptField(title);
        const encDesc = await encryptField(description);

        await client.query(
          `INSERT INTO records
             (patient_id, hospital_id, doctor_id, source, category, encrypted_title, encrypted_description, created_at)
           VALUES ($1, $2, NULL, 'hospital_push', $3, $4, $5, NOW())`,
          [chdsPatientId, hospital.id, category, encTitle, encDesc]
        );
        recordsInserted++;
      }
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
          hospital_local_id: patientData.hospitalLocalId,
          nid_provided: !!patientData.nid,
          nid_valid: nidValid,
          nid_error: nidError,
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
      message: matchResult.action === 'pending_review'
        ? 'Patient match is uncertain. Records held pending admin review.'
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
