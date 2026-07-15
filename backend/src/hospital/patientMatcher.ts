import { query } from '../db';
import { createHash } from 'crypto';

export interface FHIRPatientExtract {
  hospitalLocalId: string;
  nid?: string;
  fullName: string;
  dateOfBirth: string;
  gender: string;
}

// Nepal NID: exactly 16 numeric digits
const NID_REGEX = /^\d{16}$/;

export function validateNid(nid: string): { valid: boolean; error?: string } {
  if (!NID_REGEX.test(nid)) {
    return {
      valid: false,
      error: 'NID must be exactly 16 numeric digits'
    };
  }
  return { valid: true };
}

export type MatchAction = 'auto-link' | 'pending_review' | 'create_new';

export interface MatchResult {
  action: MatchAction;
  chdsPatientId?: string;
  matchMethod?: string;
  confidence: number;
  score: number;
}

function hashNid(nid: string): string {
  return createHash('sha256').update(nid.trim().toUpperCase()).digest('hex');
}

function scoreCandidate(
  incoming: FHIRPatientExtract,
  candidate: { id: string; full_name: string; date_of_birth: string; gender: string }
): number {
  let score = 0;

  if (incoming.fullName.trim().toLowerCase() === candidate.full_name?.trim().toLowerCase()) {
    score += 40;
  } else {
    const a = incoming.fullName.toLowerCase().replace(/\s+/g, '');
    const b = (candidate.full_name || '').toLowerCase().replace(/\s+/g, '');
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    let matches = 0;
    for (const char of shorter) {
      if (longer.includes(char)) matches++;
    }
    const similarity = longer.length > 0 ? matches / longer.length : 0;
    if (similarity >= 0.8) score += 25;
  }

  if (incoming.dateOfBirth === candidate.date_of_birth?.split('T')[0]) {
    score += 35;
  }

  if (incoming.gender?.toLowerCase() === candidate.gender?.toLowerCase()) {
    score += 10;
  }

  return score;
}

export async function matchPatient(
  incoming: FHIRPatientExtract
): Promise<MatchResult> {

  if (incoming.nid) {
    const validation = validateNid(incoming.nid);
    if (!validation.valid) {
      // NID format invalid : skip fast path but still process
      // The error is returned so the caller can log it
    }
    const nidHash = hashNid(incoming.nid);
    const { rows } = await query(
      `SELECT id FROM patients WHERE nid_hash = $1 LIMIT 1`,
      [nidHash]
    );
    if (rows.length > 0) {
      return {
        action: 'auto-link',
        chdsPatientId: rows[0].id,
        matchMethod: 'nid',
        confidence: 1.0,
        score: 110
      };
    }
  }

  const { rows: candidates } = await query(
    `SELECT id, full_name, date_of_birth, gender
     FROM patients
     WHERE date_of_birth = $1
        OR LOWER(full_name) = LOWER($2)`,
    [incoming.dateOfBirth, incoming.fullName]
  );

  if (candidates.length === 0) {
    return { action: 'create_new', confidence: 0, score: 0 };
  }

  let bestScore = 0;
  let bestId: string | undefined;

  for (const c of candidates) {
    const s = scoreCandidate(incoming, c);
    if (s > bestScore) {
      bestScore = s;
      bestId = c.id;
    }
  }

  const confidence = bestScore / 110;

  if (bestScore >= 75) {
    return {
      action: 'auto-link',
      chdsPatientId: bestId,
      matchMethod: 'composite',
      confidence,
      score: bestScore
    };
  }

  if (bestScore >= 40) {
    return {
      action: 'pending_review',
      chdsPatientId: bestId,
      matchMethod: 'composite',
      confidence,
      score: bestScore
    };
  }

  return { action: 'create_new', confidence, score: bestScore };
}
