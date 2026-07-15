import pool from '../src/db';
import { createHash } from 'crypto';
import { decryptField } from '../src/crypto';

async function backfill() {
  const { rows } = await pool.query(
    `SELECT id, encrypted_first_name, encrypted_last_name, encrypted_dob, encrypted_national_id,
            full_name, date_of_birth, nid_hash
     FROM patients
     WHERE full_name IS NULL OR date_of_birth IS NULL OR
           (encrypted_national_id IS NOT NULL AND nid_hash IS NULL)`
  );

  console.log(`Backfilling ${rows.length} patients...`);

  let count = 0;
  for (const row of rows) {
    try {
      const fullName = row.full_name || (
        await decryptField(row.encrypted_first_name) + ' ' +
        await decryptField(row.encrypted_last_name)
      );
      const dob = row.date_of_birth || await decryptField(row.encrypted_dob);
      let nidHash = row.nid_hash;

      if (row.encrypted_national_id && !row.nid_hash) {
        const plainNid = await decryptField(row.encrypted_national_id);
        nidHash = createHash('sha256').update(plainNid.trim().toUpperCase()).digest('hex');
      }

      await pool.query(
        `UPDATE patients SET full_name = $1, date_of_birth = $2, nid_hash = COALESCE($3, nid_hash)
         WHERE id = $4`,
        [fullName, dob, nidHash, row.id]
      );
      count++;
    } catch (e) {
      console.error(`Failed backfill for patient ${row.id}:`, e);
    }
  }

  console.log(`Backfilled ${count} patients. Done.`);
  process.exit(0);
}

backfill().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
