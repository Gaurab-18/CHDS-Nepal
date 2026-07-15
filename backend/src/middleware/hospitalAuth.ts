import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
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

// Shared lookup logic used by both middleware variants
async function lookupHospital(apiKey: string): Promise<HospitalInfo | null> {
  const keyHash = createHash('sha256').update(apiKey).digest('hex');
  const { rows } = await query(
    `SELECT id, name, status, terms_accepted_at, terms_version
     FROM hospitals WHERE api_key_hash = $1`,
    [keyHash]
  );
  return rows.length > 0 ? rows[0] : null;
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
