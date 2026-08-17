import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { query } from '../db';

export interface HospitalInfo {
  id: string;
  name: string;
  status: string;
  terms_accepted_at: string | null;
  terms_version: string | null;
}

export interface HospitalRequest extends Request {
  hospital?: HospitalInfo;
}

// During key rotation the previous key stays valid for a grace window so the
// hospital can update their config without downtime. Default 24h.
export const getGraceHours = (): number => {
  const hours = parseInt(process.env.HOSPITAL_KEY_GRACE_HOURS || '24', 10);
  return Number.isFinite(hours) && hours > 0 ? hours : 24;
};

// Shared lookup logic used by both middleware variants.
// Accepts the current key, or the previous key while still within its grace window.
async function lookupHospital(apiKey: string): Promise<HospitalInfo | null> {
  const { rows } = await query(
    `SELECT id, name, status, terms_accepted_at, terms_version, api_key_hash, api_key_previous_hash, api_key_previous_expires_at
     FROM hospitals
     WHERE api_key_hash IS NOT NULL
        OR api_key_previous_hash IS NOT NULL
     LIMIT 1`,
  );

  for (const row of rows) {
    if (row.api_key_hash && await bcrypt.compare(apiKey, row.api_key_hash)) {
      return row;
    }
    if (row.api_key_previous_hash && row.api_key_previous_expires_at && new Date(row.api_key_previous_expires_at) > new Date()) {
      if (await bcrypt.compare(apiKey, row.api_key_previous_hash)) {
        return row;
      }
    }
  }
  return null;
}

// Strict: requires active status (for ingest and data operations)
export const hospitalAuth = async (
  req: HospitalRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const apiKey = req.headers['x-hospital-api-key'] as string;

  if (!apiKey) {
    res.status(401).json({ error: 'Missing X-Hospital-API-Key header' });
    return;
  }

  const hospital = await lookupHospital(apiKey);

  if (!hospital) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  if (hospital.status !== 'active') {
    res.status(403).json({
      error: `Hospital account is ${hospital.status}. Contact CHDS admin.`
    });
    return;
  }

  req.hospital = hospital;
  next();
};

// Relaxed: just validates API key exists (for terms acceptance, status checks)
// Any status hospital can use this, including 'pending'
export const hospitalAuthRelaxed = async (
  req: HospitalRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const apiKey = req.headers['x-hospital-api-key'] as string;

  if (!apiKey) {
    res.status(401).json({ error: 'Missing X-Hospital-API-Key header' });
    return;
  }

  const hospital = await lookupHospital(apiKey);

  if (!hospital) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  req.hospital = hospital;
  next();
};
