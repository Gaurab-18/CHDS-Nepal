import { Router, Response } from 'express';
import { query } from '../db';
import { hospitalAuthRelaxed, HospitalRequest } from '../middleware/hospitalAuth';
import { insertHospitalAuditLog } from '../hospital/auditLog';

const router = Router();

// ── Current terms text ─────────────────────────────────────────
// In production, this would come from a DB table or config file.
const CURRENT_TERMS_VERSION = 'v1.0';
const TERMS_TEXT = `CHDS Nepal : Hospital Partner Terms & Conditions

H1. DEFINITIONS
"Hospital" means the registered healthcare institution that has been issued an API key by CHDS Nepal. "API Key" means the unique cryptographic credential issued to the Hospital for authenticating submissions to the System. "PHI" means Protected Health Information as defined by HIPAA (45 CFR § 160.103). "Ingest" means the act of submitting a FHIR R4 Bundle to the System via the designated API endpoint. "CHDS Nepal" means the Centralised Healthcare Data Sharing System platform operated as a research initiative in Nepal.

H2. ACCEPTANCE AND AUTHORISATION
These Hospital Partner Terms become legally binding upon: (a) the Hospital's written acceptance during onboarding; or (b) the Hospital's first use of its API key to submit data to the System, whichever occurs earlier. The individual accepting these Terms on behalf of the Hospital warrants that they have full authority to bind the Hospital as an entity.
CHDS Nepal reserves the right to reject, suspend, or terminate any Hospital's API access at any time, with or without cause, upon 7 days' written notice (or immediately in cases of material breach, security risk, or suspected fraudulent activity).

H3. DATA PRIVACY AND HIPAA-ALIGNED OBLIGATIONS
The Hospital agrees to comply with all applicable privacy and data protection laws in Nepal, including the Privacy Act 2075 (2018) and the Electronic Transactions Act 2063 (2006). The Hospital acknowledges that CHDS Nepal applies HIPAA as a best-practice design reference framework.
The Hospital agrees that all PHI submitted to the System will be transmitted exclusively over HTTPS/TLS 1.3 encrypted connections and that it will not submit PHI through any unencrypted channel.
The Hospital acknowledges that PHI submitted to the System is encrypted at rest using AES-256 via PostgreSQL pgcrypto and that CHDS Nepal shall not be liable for breaches resulting from the Hospital's own insecure submission practices or credential mismanagement.

H4. PATIENT CONSENT OBLIGATIONS
The Hospital unconditionally warrants that it has obtained all necessary, valid, and informed patient consents before submitting any patient data to the System. The Hospital's submission of a FHIR Bundle constitutes a legal representation that such consent exists for every patient included in the submission.
Upon a patient revoking hospital consent within the System, the Hospital will be notified and must immediately cease submitting further records for that patient. The Hospital acknowledges that CHDS Nepal will enforce consent revocations at the API level.
CHDS Nepal SHALL NOT BE LIABLE for any consequences arising from the Hospital's submission of data without valid patient consent. The Hospital shall fully indemnify CHDS Nepal against any claim, penalty, fine, or regulatory action arising from such unauthorised submission.

H5. DATA MINIMISATION AND ACCURACY
The Hospital shall submit only the minimum data necessary for legitimate healthcare data sharing purposes. The submission of excessive, irrelevant, or fabricated patient data is strictly prohibited and constitutes grounds for immediate API key revocation.
The Hospital certifies that all submitted patient data is accurate and complete to the best of its knowledge. The Hospital shall promptly notify CHDS Nepal of any discovered inaccuracies and cooperate in correcting submitted records.

H6. API KEY SECURITY AND SOLE RESPONSIBILITY
The Hospital is solely, exclusively, and unconditionally responsible for the security of its API key. The API key is equivalent to a password and must be treated with equivalent security measures.
(a) The API key must be stored in a secure secrets management system and must not be hard-coded in any source code, committed to any version control system, or transmitted via any unencrypted channel.
(b) The Hospital is solely liable for all activity conducted using its API key, whether authorised by the Hospital or not.
(c) Upon suspicion of key compromise, the Hospital must immediately request key regeneration through the CHDS Nepal admin dashboard. CHDS Nepal shall not be liable for any data submitted or accessed using a compromised key before notification.
(d) CHDS Nepal SHALL NOT BE LIABLE for any loss, breach, or unauthorised access arising from the Hospital's failure to adequately secure its API credentials.

H7. LIMITATION OF LIABILITY : HOSPITAL PARTNER
TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, CHDS NEPAL'S TOTAL LIABILITY TO THE HOSPITAL UNDER THESE TERMS SHALL NOT EXCEED NPR 50,000 (FIFTY THOUSAND NEPALESE RUPEES) IN AGGREGATE FOR ALL CLAIMS ARISING IN ANY 12-MONTH PERIOD.
CHDS NEPAL SHALL NOT BE LIABLE TO THE HOSPITAL FOR ANY: LOSS OF PROFITS; LOSS OF REVENUE; LOSS OF DATA; LOSS OF GOODWILL; BUSINESS INTERRUPTION; INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES OF ANY NATURE, HOWSOEVER ARISING, EVEN IF CHDS NEPAL HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
The Hospital agrees to fully indemnify, defend, and hold harmless CHDS Nepal from and against any claim brought by a patient, regulator, or third party arising from: (i) the Hospital's submission of data without valid patient consent; (ii) the Hospital's submission of inaccurate or fabricated data; (iii) the Hospital's failure to secure its API key; or (iv) the Hospital's violation of any applicable law.

H8. AUDIT AND COMPLIANCE
All Hospital submissions and API activity are logged in the System's immutable audit trail. The Hospital consents to CHDS Nepal retaining and reviewing these logs for security, compliance, and operational purposes.
The Hospital agrees to cooperate fully with any audit or investigation conducted by CHDS Nepal or a lawfully authorised regulatory authority within 14 days of any written request.

H9. TERMINATION
Either party may terminate these Hospital Partner Terms upon 30 days' written notice to the other party. CHDS Nepal may terminate immediately upon: (a) any material breach by the Hospital; (b) discovery of fraudulent, unauthorised, or harmful activity using the Hospital's API key; (c) a court order or regulatory direction requiring termination; or (d) CHDS Nepal's discontinuation of the System.
Upon termination, the Hospital's API key will be permanently revoked. Existing patient data will be retained or deleted in accordance with patient consent preferences and applicable law. Termination does not release the Hospital from any liability arising prior to the termination date.

H10. GOVERNING LAW
These Hospital Partner Terms are governed by the laws of Nepal. The Hospital irrevocably submits to the exclusive jurisdiction of the courts of Kathmandu, Nepal for the resolution of any dispute arising under these Terms.`.trim();

// GET /api/v1/hospital/terms : returns current terms
router.get('/terms', async (_req: HospitalRequest, res: Response) => {
  return res.json({
    terms_version: CURRENT_TERMS_VERSION,
    terms_text: TERMS_TEXT,
    required: true,
    message: 'Hospital must accept these terms before activation.'
  });
});

// POST /api/v1/hospital/accept-terms : hospital accepts terms
router.post('/accept-terms', hospitalAuthRelaxed, async (req: HospitalRequest, res: Response) => {
  const hospital = req.hospital!;
  const { terms_version } = req.body;

  if (!terms_version) {
    return res.status(400).json({ error: 'terms_version is required' });
  }

  if (terms_version !== CURRENT_TERMS_VERSION) {
    return res.status(400).json({
      error: `Unsupported terms version. Current version: ${CURRENT_TERMS_VERSION}`
    });
  }

  // Check if already accepted
  if (hospital.terms_accepted_at) {
    return res.status(409).json({
      error: 'Terms already accepted',
      accepted_at: hospital.terms_accepted_at,
      terms_version: hospital.terms_version
    });
  }

  try {
    await query(
      `UPDATE hospitals
       SET terms_accepted_at = NOW(), terms_version = $1
       WHERE id = $2 AND terms_accepted_at IS NULL
       RETURNING id, name, terms_accepted_at, terms_version`,
      [terms_version, hospital.id]
    );

    await insertHospitalAuditLog({
      hospitalId: hospital.id,
      eventType: 'terms_accept',
      actorType: 'hospital',
      actorId: hospital.id,
      targetType: 'hospital',
      targetId: hospital.id,
      outcome: 'success',
      details: { terms_version, terms_text: TERMS_TEXT.substring(0, 100) + '...' },
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      message: 'Terms accepted. Admin will activate your account shortly.',
      terms_version,
      accepted_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('Terms acceptance error:', err);
    return res.status(500).json({ error: 'Failed to record terms acceptance' });
  }
});

export default router;
