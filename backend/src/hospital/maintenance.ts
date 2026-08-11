import { query } from '../db';
import { insertHospitalAuditLog } from './auditLog';
import logger from '../logger';

// Pending bundles are live PHI sitting in a staging state. Unreviewed bundles
// older than PENDING_BUNDLE_TTL_DAYS (default 30) are auto-discarded so the
// hospital must re-submit. This prevents stale encrypted PHI from accumulating
// with no lifecycle management.
const getTtlDays = (): number => {
  const parsed = parseInt(process.env.PENDING_BUNDLE_TTL_DAYS || '30', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
};

// Discards expired pending_review bundles. Returns how many links were expired.
export async function expirePendingBundles(): Promise<number> {
  const ttlDays = getTtlDays();

  const { rows: stale } = await query(
    `SELECT id, hospital_id, hospital_local_id, chds_patient_id, pending_reason
     FROM hospital_patient_links
     WHERE status = 'pending_review'
       AND pending_bundle IS NOT NULL
       AND created_at < CURRENT_TIMESTAMP - ($1::int || ' days')::interval`,
    [ttlDays]
  );

  if (stale.length === 0) return 0;

  for (const link of stale) {
    try {
      await query(`DELETE FROM hospital_patient_links WHERE id = $1`, [link.id]);
      await insertHospitalAuditLog({
        hospitalId: link.hospital_id,
        eventType: 'match_expire',
        actorType: 'system',
        targetType: 'link',
        targetId: link.id,
        outcome: 'success',
        details: {
          hospital_local_id: link.hospital_local_id,
          patient_id: link.chds_patient_id,
          pending_reason: link.pending_reason,
          ttl_days: ttlDays,
          reason: 'Pending review exceeded maximum age. Bundle discarded; hospital must re-submit.',
        },
      });
    } catch (err) {
      logger.error({ err, linkId: link.id }, 'Failed to expire pending bundle');
    }
  }

  return stale.length;
}

// Runs once at startup, then on an interval.
export function startPendingBundleExpiry(): NodeJS.Timeout {
  const intervalHours = parseInt(process.env.PENDING_BUNDLE_EXPIRY_CHECK_HOURS || '6', 10);
  const intervalMs = (Number.isFinite(intervalHours) && intervalHours > 0 ? intervalHours : 6) * 60 * 60 * 1000;

  const run = async () => {
    try {
      const expired = await expirePendingBundles();
      if (expired > 0) {
        logger.info({ expired }, 'Expired stale pending review bundles');
      }
    } catch (err) {
      logger.error({ err }, 'Pending bundle expiry job failed');
    }
  };

  void run();
  return setInterval(run, intervalMs);
}