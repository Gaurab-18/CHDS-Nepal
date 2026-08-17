import { query } from '../db';
import { createHash, timingSafeEqual } from 'crypto';

export interface FHIRPatientExtract {
  hospitalLocalId: string;
  nid?: string;
  fullName: string;
  dateOfBirth: string;
  gender: string;
}

// Nepal NID: exactly 16 numeric digits
const NID_REGEX = /^\d{16}$/;

// Constant-time comparison of two hex NID hashes so a requester cannot learn
// how many hash bytes match by observing response timing.
function nidHashesEqual(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

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
  requiresEvidence?: boolean;
  reason?: string;
}

export function hashNid(nid: string): string {
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

  const nidValid = incoming.nid ? validateNid(incoming.nid).valid : false;

  // ── Rule 1: authoritative NID auto-link ─────────────────────
  if (incoming.nid && nidValid) {
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

  // ── Composite candidate search ────────────────────────────────
  const { rows: candidates } = await query(
    `SELECT id, full_name, date_of_birth, gender, nid_hash
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

  // ── Rule 2: valid NID provided → NID is authoritative ─────────
  // A valid national ID uniquely identifies one person. If Rule 1 found no exact
  // NID match, this is a DIFFERENT person : even if name/DOB/gender collide with
  // an existing record. Create a separate patient; there is nothing to hold back.
  if (incoming.nid && nidValid) {
    const incomingNidHash = hashNid(incoming.nid);

    // Index-drift safety: if a candidate carries the SAME NID hash but Rule 1's
    // exact lookup missed it, it's the same person with a data integrity issue →
    // route to review instead of creating a duplicate.
    const sameNidCandidate = candidates.find((c) => nidHashesEqual(incomingNidHash, c.nid_hash));
    if (sameNidCandidate) {
      return {
        action: 'pending_review',
        chdsPatientId: sameNidCandidate.id,
        matchMethod: 'nid',
        confidence,
        score: bestScore,
        requiresEvidence: true,
        reason: 'Incoming and stored NID are identical but the exact NID index did not link. Review before merging.'
      };
    }

    // No existing patient has this NID → distinct person. Demographics match is
    // not enough to merge when a valid NID is present.
    return {
      action: 'create_new',
      confidence: 0,
      score: bestScore,
      reason: 'Valid NID provided and not found on file : distinct person despite matching demographics.'
    };
  }

  // ── Rule 3: no NID → never auto-link, always review ───────────
  if (bestScore >= 40) {
    return {
      action: 'pending_review',
      chdsPatientId: bestId,
      matchMethod: 'composite',
      confidence,
      score: bestScore,
      requiresEvidence: true,
      reason: 'Matching on demographics only (no national ID). Review before merging to avoid merging different people with same name/DOB/gender.'
    };
  }

  // ── Rule 4: below threshold → new patient ─────────────────────
  return { action: 'create_new', confidence, score: bestScore };
}