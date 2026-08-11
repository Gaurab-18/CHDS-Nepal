// Legacy-row forward migration: give every master-key-encrypted patient its own
// per-patient HKDF key so there is a single encryption tier in the table.
//
// Legacy rows are those with enc_key_salt IS NULL : created before the HKDF
// design. They currently encrypt all PHI under ENCRYPTION_KEY directly. This
// script decrypts each field with the master key, assigns a fresh random salt,
// derives the patient key from the SAME master key, re-encrypts, and stores the
// new salt. The ciphertexts stay decryptable (same master, new key) and every
// row now carries its own salt.
//
// Run:
//   CHDS_DB_URL=postgres://... npx ts-node --project tsconfig.test.json scripts/migrate-legacy-rows.ts
//   (dry-run by default; add --commit to write)
//
// Note: rows that fail to decrypt under the master key are reported and skipped,
// never overwritten. If your DB was seeded with a key that no longer matches
// ENCRYPTION_KEY, those rows cannot be migrated without that original key.
import { Pool } from 'pg';
import crypto from 'crypto';

const DB_URL = process.env.CHDS_DB_URL || 'postgres://postgres:change_me_super_secret_db_password@localhost:5432/chds_db';
const MASTER_KEY = process.env.ENCRYPTION_KEY;
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
  const r = await pool.query('SELECT pgp_sym_encrypt($1::text, $2) AS enc', [text, key]);
  return r.rows[0].enc;
}

async function main() {
  if (!MASTER_KEY) {
    console.error('ENCRYPTION_KEY must be set (the current master key).');
    process.exit(1);
  }

  console.log(`Mode: ${COMMIT ? 'COMMIT' : 'DRY-RUN'} (add --commit to write)`);

  const legacy = await pool.query(
    `SELECT id, ${PATIENT_COLS.map(c => c[0]).join(', ')}
     FROM patients WHERE enc_key_salt IS NULL`
  );

  console.log(`Found ${legacy.rowCount} legacy patient row(s) without a salt.`);

  let ok = 0;
  let failed = 0;

  for (const p of legacy.rows) {
    try {
      // Verify all required fields decrypt under the master key before touching anything.
      const plain: Record<string, string | null> = {};
      for (const [col] of PATIENT_COLS) {
        plain[col] = p[col] ? await decrypt(pool, p[col], MASTER_KEY) : null;
      }

      if (COMMIT) {
        const salt = crypto.randomBytes(32);
        const patientKey = deriveKey(MASTER_KEY, salt);

        const setCols: string[] = [];
        const setVals: unknown[] = [];
        for (const [col, required] of PATIENT_COLS) {
          if (plain[col] === null && required) throw new Error(`required column ${col} is null`);
          setCols.push(`${col} = $${setVals.length + 2}`);
          setVals.push(plain[col] !== null ? await encrypt(pool, plain[col], patientKey) : null);
        }
        await pool.query(
          `UPDATE patients SET enc_key_salt = $1, ${setCols.join(', ')} WHERE id = $${setVals.length + 2}`,
          [salt, ...setVals, p.id]
        );

        // Re-encrypt this patient's records with the new patient key.
        const records = await pool.query(
          `SELECT id, ${RECORD_COLS.map(c => c[0]).join(', ')} FROM records WHERE patient_id = $1`,
          [p.id]
        );
        for (const rec of records.rows) {
          const rPlain: Record<string, string | null> = {};
          for (const [col] of RECORD_COLS) {
            rPlain[col] = rec[col] ? await decrypt(pool, rec[col], MASTER_KEY) : null;
          }
          const rSet: string[] = [];
          const rVals: unknown[] = [];
          for (const [col, required] of RECORD_COLS) {
            if (rPlain[col] === null && required) throw new Error(`record ${rec.id} ${col} is null`);
            rSet.push(`${col} = $${rVals.length + 1}`);
            rVals.push(rPlain[col] !== null ? await encrypt(pool, rPlain[col], patientKey) : null);
          }
          await pool.query(
            `UPDATE records SET ${rSet.join(', ')} WHERE id = $${rVals.length + 1}`,
            [...rVals, rec.id]
          );
        }

        console.log(`  patient ${p.id}: migrated (patient + records re-encrypted)`);
      } else {
        console.log(`  patient ${p.id}: would migrate (master-key decrypt OK)`);
      }
      ok++;
    } catch (err) {
      failed++;
      console.error(`  patient ${p.id}: SKIPPED : ${(err as Error).message}${(err as any).position ? ` @pos ${(err as any).position}` : ''}`);
    }
  }

  console.log(`\nResult: ${ok} OK, ${failed} skipped${COMMIT ? '' : ' (dry-run : re-run with --commit to write)'}.`);
  await pool.end();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});