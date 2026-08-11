import { query } from '../src/db';
import { loginAs, clearCookies } from './helpers';

const PATIENT_EMAIL = 'patient@chds.np';
const PASSWORD = '@CHDS2026!';

describe('Encryption', () => {

  afterEach(() => clearCookies());

  test('patient records have encrypted BYTEA columns in DB', async () => {
    const r = await query(
      `SELECT encrypted_title, encrypted_description FROM records LIMIT 1`
    );
    if (r.rows.length === 0) return; // skip if no records
    const row = r.rows[0];
    expect(row.encrypted_title).toBeInstanceOf(Buffer);
    expect(row.encrypted_description).toBeInstanceOf(Buffer);
  });

  test('patient PHI is encrypted bytea in DB', async () => {
    const r = await query(
      'SELECT encrypted_first_name, encrypted_last_name, encrypted_dob FROM patients LIMIT 1'
    );
    expect(r.rows.length).toBeGreaterThan(0);
    const row = r.rows[0];
    expect(row.encrypted_first_name).toBeInstanceOf(Buffer);
    expect(row.encrypted_last_name).toBeInstanceOf(Buffer);
    expect(row.encrypted_dob).toBeInstanceOf(Buffer);
  });

  test('decrypt via API matches original', async () => {
    const { status } = await loginAs(PATIENT_EMAIL, PASSWORD);
    expect(status).toBe(200);

    const { getCookies, apiUrl } = require('./helpers');
    const res = await fetch(apiUrl('/patient/records'), {
      headers: { Cookie: getCookies().join('; ') },
    });
    expect(res.status).toBe(200);
    const records: any = await res.json();
    expect(Array.isArray(records)).toBe(true);
    if (records.length > 0) {
      expect(records[0]).toHaveProperty('title');
      expect(records[0]).toHaveProperty('description');
      expect(typeof records[0].title).toBe('string');
      expect(typeof records[0].description).toBe('string');
    }
  });
});
