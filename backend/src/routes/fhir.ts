import { Router, Request, Response } from 'express';
import { query } from '../db';
import { authenticate, authorize } from '../middleware/authorize';
import { auditLog } from '../middleware/auditLogger';
import { encryptField } from '../crypto';
import logger from '../logger';

const router = Router();

const FHIR_BASE = process.env.FHIR_BASE || 'http://fhir:8080';

// GET /fhir/metadata : proxy to HAPI FHIR
router.get('/metadata', async (_req: Request, res: Response) => {
  try {
    const fhirRes = await fetch(`${FHIR_BASE}/fhir/metadata`);
    const data = await fhirRes.json();
    res.status(fhirRes.status).json(data);
  } catch (err) {
    logger.error({ err }, 'FHIR metadata proxy error');
    res.status(502).json({ error: 'FHIR server unreachable' });
  }
});

// POST /fhir/Patient : accept FHIR R4 Patient bundle, map to patients table
router.post('/Patient', authenticate, authorize('doctor', 'admin'),
  auditLog('FHIR_PATIENT_PUSH'),
  async (req: Request, res: Response) => {
    try {
      const bundle = req.body;

      if (!bundle || bundle.resourceType !== 'Patient') {
        res.status(400).json({ error: 'Expected a FHIR R4 Patient resource' });
        return;
      }

      // Extract patient identifiers from FHIR resource
      const patientId = bundle.id || bundle.identifier?.[0]?.value || null;
      if (!patientId) {
        res.status(400).json({ error: 'Patient resource must have an id or identifier' });
        return;
      }

      const nameEntry = bundle.name?.[0];
      const firstName = nameEntry?.given?.[0] || 'Unknown';
      const lastName = nameEntry?.family || 'Unknown';

      const dob = bundle.birthDate || null;
      const phone = bundle.telecom?.find((t: any) => t.system === 'phone')?.value || null;
      const address = bundle.address?.[0]?.text || bundle.address?.[0]?.line?.join(', ') || null;

      // Check if user exists by fhir_patient_id or create a new user
      const existingUser = patientId
        ? await query('SELECT id FROM users WHERE username = $1', [`fhir_${patientId}`])
        : null;

      let userId: string;
      if (existingUser?.rows.length) {
        userId = existingUser.rows[0].id;
      } else {
        const email = bundle.telecom?.find((t: any) => t.system === 'email')?.value
          || `fhir_${patientId}@chds.np`;

        const userResult = await query(
          `INSERT INTO users (username, email, password_hash, role, onboarding_complete)
           VALUES ($1, $2, 'FHIR_PUSH', 'patient', true)
           ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
           RETURNING id`,
          [`fhir_${patientId}`, email]
        );
        userId = userResult.rows[0].id;
      }

      // Check if patient record already exists
      const existingPatient = await query(
        'SELECT id FROM patients WHERE user_id = $1',
        [userId]
      );

      if (existingPatient.rows.length) {
        // Patient already exists, return existing
        res.status(200).json({
          message: 'Patient already exists',
          patient_id: existingPatient.rows[0].id,
          user_id: userId,
          source: 'fhir_push',
        });
        return;
      }

      // Encrypt PHI fields
      const encFirstName = await encryptField(firstName);
      const encLastName = await encryptField(lastName);
      const encDob = dob ? await encryptField(dob) : await encryptField('1900-01-01');
      const encPhone = phone ? await encryptField(phone) : null;
      const encAddress = address ? await encryptField(address) : null;

      const patientResult = await query(
        `INSERT INTO patients (user_id, encrypted_first_name, encrypted_last_name, encrypted_dob, encrypted_phone, encrypted_address)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [userId, encFirstName, encLastName, encDob, encPhone, encAddress]
      );
      const newPatientId = patientResult.rows[0].id;

      // Create a record entry with source = fhir_push
      const encTitle = await encryptField(`FHIR Patient: ${firstName} ${lastName}`);
      const encDesc = await encryptField(`Patient pushed from FHIR system. DOB: ${dob || 'N/A'}, Phone: ${phone || 'N/A'}`);

      await query(
        `INSERT INTO records (patient_id, doctor_id, source, encrypted_title, encrypted_description)
         VALUES ($1, $2, 'fhir_push', $3, $4)`,
        [newPatientId, req.user!.id, encTitle, encDesc]
      );

      res.status(201).json({
        message: 'FHIR Patient created and mapped',
        patient_id: newPatientId,
        user_id: userId,
        source: 'fhir_push',
        name: `${firstName} ${lastName}`,
      });
    } catch (err) {
      logger.error({ err }, 'FHIR Patient push error');
      res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── Helpers ───────────────────────────────────────────────

async function findPatientByReference(ref: string): Promise<{ patient_id: string; user_id: string } | null> {
  if (ref.startsWith('Patient/')) {
    const fhirId = ref.slice(8);
    const result = await query(
      `SELECT p.id as patient_id, u.id as user_id FROM patients p
       JOIN users u ON u.id = p.user_id
       WHERE u.username = $1`,
      [`fhir_${fhirId}`]
    );
    if (result.rows.length) return result.rows[0];
  }
  if (ref.startsWith('urn:uuid:')) {
    const result = await query(
      `SELECT p.id as patient_id, u.id as user_id FROM patients p
       JOIN users u ON u.id = p.user_id
       WHERE u.username ILIKE $1`,
      [`%${ref.slice(9)}%`]
    );
    if (result.rows.length) return result.rows[0];
  }
  return null;
}

async function createFhirRecord(
  patientId: string,
  doctorId: string,
  title: string,
  description: string,
  category: string,
): Promise<string> {
  const encTitle = await encryptField(title);
  const encDesc = await encryptField(description);
  const result = await query(
    `INSERT INTO records (patient_id, doctor_id, source, category, encrypted_title, encrypted_description)
     VALUES ($1, $2, 'fhir_push', $3, $4, $5) RETURNING id`,
    [patientId, doctorId, category, encTitle, encDesc]
  );
  return result.rows[0].id;
}

// ─── FHIR Resource Endpoints ──────────────────────────────

// POST /fhir/Observation : lab results, vitals
router.post('/Observation', authenticate, authorize('doctor', 'admin'),
  auditLog('FHIR_OBSERVATION_PUSH'),
  async (req: Request, res: Response) => {
    try {
      const resource = req.body;
      if (!resource || resource.resourceType !== 'Observation') {
        res.status(400).json({ error: 'Expected a FHIR R4 Observation resource' });
        return;
      }

      const subject = resource.subject?.reference;
      if (!subject) {
        res.status(400).json({ error: 'Observation must have a subject reference' });
        return;
      }

      const patient = await findPatientByReference(subject);
      if (!patient) {
        res.status(404).json({ error: 'Patient not found. Push Patient resource first.' });
        return;
      }

      const codeText = resource.code?.coding?.[0]?.display || resource.code?.text || 'Observation';
      const valueText = resource.valueQuantity
        ? `${resource.valueQuantity.value} ${resource.valueQuantity.unit || ''}`
        : resource.valueCodeableConcept?.coding?.[0]?.display
        || resource.valueString
        || resource.valueBoolean?.toString()
        || 'N/A';

      const recordId = await createFhirRecord(
        patient.patient_id,
        req.user!.id,
        `Lab: ${codeText}`,
        `Value: ${valueText}${resource.interpretation?.[0]?.coding?.[0]?.display ? ` | Interpretation: ${resource.interpretation[0].coding[0].display}` : ''}${resource.referenceRange?.[0]?.text ? ` | Ref Range: ${resource.referenceRange[0].text}` : ''}`,
        'general',
      );

      res.status(201).json({
        message: 'FHIR Observation mapped to record',
        record_id: recordId,
        patient_id: patient.patient_id,
        source: 'fhir_push',
        category: 'general',
      });
    } catch (err) {
      logger.error({ err }, 'FHIR Observation push error');
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// POST /fhir/Condition : diagnoses
router.post('/Condition', authenticate, authorize('doctor', 'admin'),
  auditLog('FHIR_CONDITION_PUSH'),
  async (req: Request, res: Response) => {
    try {
      const resource = req.body;
      if (!resource || resource.resourceType !== 'Condition') {
        res.status(400).json({ error: 'Expected a FHIR R4 Condition resource' });
        return;
      }

      const subject = resource.subject?.reference;
      if (!subject) {
        res.status(400).json({ error: 'Condition must have a subject reference' });
        return;
      }

      const patient = await findPatientByReference(subject);
      if (!patient) {
        res.status(404).json({ error: 'Patient not found. Push Patient resource first.' });
        return;
      }

      const diagnosis = resource.code?.coding?.[0]?.display || resource.code?.text || 'Diagnosis';
      const clinicalStatus = resource.clinicalStatus?.coding?.[0]?.code || 'unknown';
      const onset = resource.onsetDateTime || resource.onsetAge?.toString() || 'N/A';

      const recordId = await createFhirRecord(
        patient.patient_id,
        req.user!.id,
        `Diagnosis: ${diagnosis}`,
        `Status: ${clinicalStatus} | Onset: ${onset}${resource.severity?.coding?.[0]?.display ? ` | Severity: ${resource.severity.coding[0].display}` : ''}${resource.note?.[0]?.text ? ` | Note: ${resource.note[0].text}` : ''}`,
        'general',
      );

      res.status(201).json({
        message: 'FHIR Condition mapped to record',
        record_id: recordId,
        patient_id: patient.patient_id,
        source: 'fhir_push',
        category: 'general',
      });
    } catch (err) {
      logger.error({ err }, 'FHIR Condition push error');
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// POST /fhir/MedicationRequest : prescriptions
router.post('/MedicationRequest', authenticate, authorize('doctor', 'admin'),
  auditLog('FHIR_MEDICATION_REQUEST_PUSH'),
  async (req: Request, res: Response) => {
    try {
      const resource = req.body;
      if (!resource || resource.resourceType !== 'MedicationRequest') {
        res.status(400).json({ error: 'Expected a FHIR R4 MedicationRequest resource' });
        return;
      }

      const subject = resource.subject?.reference;
      if (!subject) {
        res.status(400).json({ error: 'MedicationRequest must have a subject reference' });
        return;
      }

      const patient = await findPatientByReference(subject);
      if (!patient) {
        res.status(404).json({ error: 'Patient not found. Push Patient resource first.' });
        return;
      }

      const medication = resource.medicationCodeableConcept?.coding?.[0]?.display
        || resource.medicationCodeableConcept?.text
        || resource.medicationReference?.display
        || 'Medication';
      const dosageInstruction = resource.dosageInstruction?.[0];
      const dosage = dosageInstruction
        ? `${dosageInstruction.text || ''}${dosageInstruction.doseAndRate?.[0]?.doseQuantity ? ` ${dosageInstruction.doseAndRate[0].doseQuantity.value} ${dosageInstruction.doseAndRate[0].doseQuantity.unit || ''}` : ''}`.trim()
        : '';
      const frequency = dosageInstruction?.timing?.code?.text
        || dosageInstruction?.timing?.repeat?.frequency
          ? `${dosageInstruction.timing.repeat.frequency}x/${dosageInstruction.timing.repeat.period || 1} ${dosageInstruction.timing.repeat.periodUnit || 'day(s)'}`
          : '';

      const recordId = await createFhirRecord(
        patient.patient_id,
        req.user!.id,
        `Prescription: ${medication}`,
        `Dosage: ${dosage || 'N/A'}${frequency ? ` | Frequency: ${frequency}` : ''}${resource.status ? ` | Status: ${resource.status}` : ''}`,
        'prescription',
      );

      res.status(201).json({
        message: 'FHIR MedicationRequest mapped to record',
        record_id: recordId,
        patient_id: patient.patient_id,
        source: 'fhir_push',
        category: 'prescription',
      });
    } catch (err) {
      logger.error({ err }, 'FHIR MedicationRequest push error');
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// POST /fhir/DiagnosticReport : test reports
router.post('/DiagnosticReport', authenticate, authorize('doctor', 'admin'),
  auditLog('FHIR_DIAGNOSTIC_REPORT_PUSH'),
  async (req: Request, res: Response) => {
    try {
      const resource = req.body;
      if (!resource || resource.resourceType !== 'DiagnosticReport') {
        res.status(400).json({ error: 'Expected a FHIR R4 DiagnosticReport resource' });
        return;
      }

      const subject = resource.subject?.reference;
      if (!subject) {
        res.status(400).json({ error: 'DiagnosticReport must have a subject reference' });
        return;
      }

      const patient = await findPatientByReference(subject);
      if (!patient) {
        res.status(404).json({ error: 'Patient not found. Push Patient resource first.' });
        return;
      }

      const reportTitle = resource.code?.coding?.[0]?.display || resource.code?.text || 'Diagnostic Report';
      const conclusion = resource.conclusion || '';
      const resultCount = resource.result?.length || 0;

      const recordId = await createFhirRecord(
        patient.patient_id,
        req.user!.id,
        `Report: ${reportTitle}`,
        `${resource.status ? `Status: ${resource.status} | ` : ''}Results: ${resultCount} observation(s)${conclusion ? ` | Conclusion: ${conclusion}` : ''}${resource.effectiveDateTime ? ` | Date: ${resource.effectiveDateTime}` : ''}`,
        'general',
      );

      res.status(201).json({
        message: 'FHIR DiagnosticReport mapped to record',
        record_id: recordId,
        patient_id: patient.patient_id,
        source: 'fhir_push',
        category: 'general',
        results_count: resultCount,
      });
    } catch (err) {
      logger.error({ err }, 'FHIR DiagnosticReport push error');
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
