import pool from '../db';

export type HospitalEventType =
  | 'register'
  | 'terms_accept'
  | 'activate'
  | 'suspend'
  | 'api_key_gen'
  | 'api_key_regen'
  | 'ingest'
  | 'patient_match'
  | 'match_confirm'
  | 'match_reject'
  | 'consent_auto'
  | 'consent_revoke';

export type ActorType = 'hospital' | 'admin' | 'system' | 'patient';

export async function insertHospitalAuditLog(params: {
  hospitalId: string;
  eventType: HospitalEventType;
  actorType: ActorType;
  actorId?: string;
  targetType?: string;
  targetId?: string;
  outcome?: 'success' | 'failure';
  details?: Record<string, any>;
  ipAddress?: string;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO hospital_audit_log
         (hospital_id, event_type, actor_type, actor_id, target_type, target_id,
          outcome, details, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        params.hospitalId,
        params.eventType,
        params.actorType,
        params.actorId || null,
        params.targetType || null,
        params.targetId || null,
        params.outcome || 'success',
        params.details ? JSON.stringify(params.details) : null,
        params.ipAddress || null,
      ]
    );
  } catch (err) {
    console.error('Failed to insert hospital audit log:', err);
    throw err;
  } finally {
    client.release();
  }
}
