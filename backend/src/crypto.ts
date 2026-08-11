import { query } from './db';
import crypto from 'crypto';

const getEncryptionKey = (): string => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }
  return key;
};

/**
 * Per-patient key derivation (HKDF-SHA256).
 *
 * The master ENCRYPTION_KEY is never used directly on per-patient PHI.
 * Each patient gets a random 32-byte salt (stored in `patients.enc_key_salt`),
 * and HKDF derives a unique key per patient from (master, salt). A leaked key
 * for one patient cannot decrypt any other patient's records, and rotating the
 * master key does not require re-encrypting patient data.
 */
const PATIENT_INFO = 'chds-phi-v1';

export const derivePatientKey = (salt: Buffer): Buffer =>
  Buffer.from(crypto.hkdfSync('sha256', Buffer.from(getEncryptionKey()), salt, Buffer.from(PATIENT_INFO), 32));

export const generatePatientSalt = (): Buffer => crypto.randomBytes(32);

// Fetches a patient's derived key (base64) or null for legacy rows (no salt).
export const getPatientKey = async (patientId: string): Promise<string | null> => {
  const r = await query('SELECT enc_key_salt FROM patients WHERE id = $1', [patientId]);
  if (r.rows.length && r.rows[0].enc_key_salt) {
    return derivePatientKey(r.rows[0].enc_key_salt).toString('base64');
  }
  return null;
};

export const encryptForPatient = async (patientId: string, plaintext: string): Promise<Buffer> => {
  const key = await getPatientKey(patientId);
  if (key) return encryptPatientField(plaintext, key);
  return encryptField(plaintext);
};

export const decryptForPatient = async (patientId: string, ciphertext: Buffer): Promise<string> => {
  const key = await getPatientKey(patientId);
  if (key) return decryptPatientField(ciphertext, key);
  return decryptField(ciphertext);
};

// Returns a closure that decrypts buffers with one patient's key (looked up once).
// Avoids a per-field DB round-trip when decrypting list rows.
export const makePatientDecryptor = async (patientId: string): Promise<(buf: Buffer) => Promise<string>> => {
  const key = await getPatientKey(patientId);
  if (key) return (buf: Buffer) => decryptPatientField(buf, key);
  return (buf: Buffer) => decryptField(buf);
};

// Returns a closure that encrypts plaintext with one patient's derived key.
export const makePatientEncryptor = async (patientId: string): Promise<(text: string) => Promise<Buffer>> => {
  const key = await getPatientKey(patientId);
  if (key) return (text: string) => encryptPatientField(text, key);
  return (text: string) => encryptField(text);
};

/**
 * Encrypt plaintext to BYTEA using a patient-derived key (AES-256 via pgp).
 * Use for BYTEA columns (patients PHI, records PHI).
 */
export const encryptPatientField = async (plaintext: string, patientKey: string): Promise<Buffer> => {
  const result = await query(
    'SELECT pgp_sym_encrypt($1, $2) AS encrypted',
    [plaintext, patientKey]
  );
  return result.rows[0].encrypted;
};

/**
 * Decrypt BYTEA ciphertext with a patient-derived key (AES-256).
 * Throws if the key is wrong : callers decide how to degrade gracefully.
 */
export const decryptPatientField = async (ciphertext: Buffer, patientKey: string): Promise<string> => {
  const result = await query(
    'SELECT pgp_sym_decrypt($1::bytea, $2) AS decrypted',
    [ciphertext, patientKey]
  );
  return result.rows[0].decrypted;
};

/**
 * Encrypt plaintext to BYTEA using pgp_sym_encrypt (AES-256).
 * Use for BYTEA columns (patients PHI, records PHI).
 */
export const encryptField = async (plaintext: string): Promise<Buffer> => {
  const result = await query(
    'SELECT pgp_sym_encrypt($1, $2) AS encrypted',
    [plaintext, getEncryptionKey()]
  );
  return result.rows[0].encrypted;
};

/**
 * Decrypt BYTEA ciphertext using pgp_sym_decrypt (AES-256).
 * Use for BYTEA columns (patients PHI, records PHI).
 */
export const decryptField = async (ciphertext: Buffer): Promise<string> => {
  const result = await query(
    'SELECT pgp_sym_decrypt($1::bytea, $2) AS decrypted',
    [ciphertext, getEncryptionKey()]
  );
  return result.rows[0].decrypted;
};

/**
 * Encrypt plaintext to base64-encoded TEXT using pgp_sym_encrypt (AES-256).
 * Use for TEXT columns (two_factor_secret).
 */
export const encryptText = async (plaintext: string): Promise<string> => {
  const result = await query(
    "SELECT encode(pgp_sym_encrypt($1, $2), 'base64') AS encrypted",
    [plaintext, getEncryptionKey()]
  );
  return result.rows[0].encrypted;
};

/**
 * Decrypt base64-encoded TEXT ciphertext using pgp_sym_decrypt (AES-256).
 * Use for TEXT columns (two_factor_secret).
 */
export const decryptText = async (ciphertext: string): Promise<string> => {
  const result = await query(
    "SELECT pgp_sym_decrypt(decode($1, 'base64'), $2) AS decrypted",
    [ciphertext, getEncryptionKey()]
  );
  return result.rows[0].decrypted;
};