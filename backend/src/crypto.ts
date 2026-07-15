import { query } from './db';

const getEncryptionKey = (): string => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }
  return key;
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
