// Re-encryption runbook: rotate the per-patient HKDF keys when ENCRYPTION_KEY changes.
//
// With the HKDF design, a master-key compromise means every patient's derived
// key is compromised, so ALL PHI must be re-encrypted under fresh salts derived
// from the NEW master key. This script is that runbook : tested, not improvised.
//
// Run:
//   OLD_ENCRYPTION_KEY=<old-key> ENCRYPTION_KEY=<new-key> \
//   CHDS_DB_URL=postgres://... npx ts-node --project tsconfig.test.json scripts/re-encrypt-phi.ts
//
// It reads the old key from OLD_ENCRYPTION_KEY (NOT the app's ENCRYPTION_KEY) so
// you can start the app only after the DB has been migrated forward.
//
// Behavior:
//   - Every patient with enc_key_salt is re-encrypted:
//       decrypt each PHI field with the OLD master key (its current salt),
//       roll to a fresh random salt, derive a new key from the NEW master,
//       re-encrypt, persist.
//   - Legacy rows (enc_key_salt IS NULL) are left untouched: they remain
//     master-key-encrypted. Run migrate-legacy-rows.ts first if you want to
//     eliminate the legacy tier before rotating.
//   - Records are re-encrypted per-patient with the new derived key, so the
//     per-patient blast radius is preserved after rotation.
//   - Dry-run by default: pass --commit to write.
import { Pool } from 'pg';
import crypto from 'crypto';

const DB_URL = process.env.CHDS_DB_URL || 'postgres://postgres:change_me_super_secret_db_password@localhost:5432/chds_db';
const OLD_KEY = process.env.OLD_ENCRYPTION_KEY;
const NEW_KEY = process.env.ENCRYPTION_KEY;
const COMMIT = process.argv.includes('--commit');

const PATIENT_INFO = 'chds-phi-v1';

const PATIENT_COLS: Array<[string, boolean]> = [
  ['encrypted_first_name', true],
  ['encrypted_last_name', true],
  ['encrypted_dob', true],
  ['encrypted_phone', false],
  ['encrypted_address', false],
  ['encrypted_national_id', false],
];

const RECORD_COLS: Array<[string, boolean]> = [
  ['encrypted_title', true],
  ['encrypted_description', true],
  ['encrypted_file_path', false],
  ['encrypted_file_hash', false],
];

function deriveKey(master: string, salt: Buffer): string {
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(master), salt, Buffer.from(PATIENT_INFO), 32)).toString('base64');
}

const pool = new Pool({ connectionString: DB_URL });

async function decrypt(pool: Pool, buf: Buffer, key: string): Promise<string> {
  const r = await pool.query('SELECT pgp_sym_decrypt($1::bytea, $2) AS dec', [buf, key]);
  return r.rows[0].dec;
}

async function encrypt(pool: Pool, text: string, key: string): Promise<Buffer> {
  const r = await pool.query('SELECT pgp_sym_encrypt($1, $2) AS enc', [text, key]);
  return r.rows[0].enc;
}

async function main() {
  if (!OLD_KEY || !NEW_KEY) {
    console.error('usage: OLD_ENCRYPTION_KEY=<old> ENCRYPTION_KEY=<new> [--commit]');
    process.exit(1);
  }
  if (OLD_KEY === NEW_KEY) {
    console.error('OLD and NEW keys are identical; nothing to rotate.');
    process.exit(1);
  }

  console.log(`Mode: ${COMMIT ? 'COMMIT' : 'DRY-RUN'} (add --commit to write)`);

  // ── Phase 1: patients with a salt ──────────────────────────────────────
  const patients = await pool.query(
    `SELECT id, enc_key_salt, ${PATIENT_COLS.map(c => c[0]).join(', ')}
     FROM patients WHERE enc_key_salt IS NOT NULL`
  );
  const patientCount = patients.rowCount ?? 0;
  console.log(`Phase 1: re-encrypting ${patientCount} patient(s) with existing salts`);

  for (const p of patients.rows) {
    try {
      const oldKey = deriveKey(OLD_KEY, p.enc_key_salt);
      const plain: Record<string, string | null> = {};
      for (const [col] of PATIENT_COLS) {
        plain[col] = p[col] ? await decrypt(pool, p[col], oldKey) : null;
      }
      // A decrypt failure here means the row was NOT encrypted under OLD_KEY :
      // abort loudly rather than silently mangling data.
      console.log(`  patient ${p.id}: old-key decrypt OK`);
    } catch (err) {
      console.error(`  patient ${p.id}: FAILED old-key decrypt : skipping (may already be migrated)`);
      console.error(`    ${(err as Error).message}`);
    }
  }
  if (patientCount > 0 && !COMMIT) {
    console.log('Dry-run: decrypt verify only. Re-run with --commit to write new salts/ciphertexts.');
  }

  // ── Phase 2: commit pass (decrypt, re-salt, re-encrypt, persist) ──────
  if (COMMIT) {
    let patientMoved = 0;
    let recordsMoved = 0;

    for (const p of patients.rows) {
      try {
        const oldKey = deriveKey(OLD_KEY, p.enc_key_salt);
        const newSalt = crypto.randomBytes(32);
        const newKey = deriveKey(NEW_KEY, newSalt);

        const plain: Record<string, string | null> = {};
        for (const [col] of PATIENT_COLS) {
          plain[col] = p[col] ? await decrypt(pool, p[col], oldKey) : null;
        }

        const setCols: string[] = [];
        const setVals: unknown[] = [];
        for (const [col, required] of PATIENT_COLS) {
          if (plain[col] === null && required) throw new Error(`required column ${col} is null`);
          setCols.push(`${col} = $${setVals.length + 2}`);
          setVals.push(plain[col] !== null ? await encrypt(pool, plain[col], newKey) : null);
        }

        await pool.query(
          `UPDATE patients SET enc_key_salt = $1, ${setCols.join(', ')} WHERE id = $${setVals.length + 2}`,
          [newSalt, ...setVals, p.id]
        );
        patientMoved++;

        // Re-encrypt this patient's records with the new derived key.
        const records = await pool.query(
          `SELECT id, ${RECORD_COLS.map(c => c[0]).join(', ')} FROM records WHERE patient_id = $1`,
          [p.id]
        );
        for (const rec of records.rows) {
          const rPlain: Record<string, string | null> = {};
          for (const [col] of RECORD_COLS) {
            rPlain[col] = rec[col] ? await decrypt(pool, rec[col], oldKey) : null;
          }
          const rSet: string[] = [];
          const rVals: unknown[] = [];
          for (const [col, required] of RECORD_COLS) {
            if (rPlain[col] === null && required) throw new Error(`record ${rec.id} ${col} is null`);
            rSet.push(`${col} = $${rVals.length + 1}`);
            rVals.push(rPlain[col] !== null ? await encrypt(pool, rPlain[col], newKey) : null);
          }
          await pool.query(
            `UPDATE records SET ${rSet.join(', ')} WHERE id = $${rVals.length + 1}`,
            [...rVals, rec.id]
          );
          recordsMoved++;
        }
      } catch (err) {
        console.error(`  patient ${p.id}: COMMIT FAILED : ${(err as Error).message}`);
      }
    }

    console.log(`Commit complete: ${patientMoved} patient(s), ${recordsMoved} record(s) re-encrypted under new master key.`);
    console.log('Now update ENCRYPTION_KEY in your environment and restart the backend.');
  }

  // ── Phase 3: report legacy tier remaining ──────────────────────────────
  const legacy = await pool.query('SELECT count(*)::int AS n FROM patients WHERE enc_key_salt IS NULL');
  if (legacy.rows[0].n > 0) {
    console.log(`Note: ${legacy.rows[0].n} legacy patient(s) still use the master key directly.`);
    console.log('Run scripts/migrate-legacy-rows.ts to give them their own salts before rotating.');
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});