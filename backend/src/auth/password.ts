import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { query } from '../db';

const SALT_ROUNDS = 12;

// Ambiguity-free alphabet (no 0/O, 1/I/l): ~32 bits of entropy at 16 chars.
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export const generateTempPassword = (length = 16): string => {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += TEMP_PASSWORD_ALPHABET[bytes[i] % TEMP_PASSWORD_ALPHABET.length];
  }
  return out;
};

export const hashPassword = async (plaintext: string): Promise<string> => {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
};

// Backup codes are hashed with bcrypt (not SHA-256) so a DB read cannot
// reverse them, matching how passwords are stored. A lower salt round is
// fine here since codes carry 128 bits of entropy.
export const hashBackupCode = async (code: string): Promise<string> => {
  return bcrypt.hash(code, 10);
};

export const verifyBackupCode = async (code: string, hashed: string): Promise<boolean> => {
  try {
    return await bcrypt.compare(code, hashed);
  } catch {
    return false;
  }
};

export const verifyPassword = async (
  plaintext: string,
  hashed: string,
  userId?: string
): Promise<boolean> => {
  const normalized = hashed.replace(/^\$2b\$/, '$2a$');
  if (await bcrypt.compare(plaintext, normalized)) {
    return true;
  }

  if (!userId) return false;

  try {
    const result = await query(
      'SELECT password_hash = crypt($1, password_hash) AS match FROM users WHERE id = $2',
      [plaintext, userId]
    );
    if (result.rows[0]?.match) {
      const newHash = await bcrypt.hash(plaintext, SALT_ROUNDS);
      await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);
      return true;
    }
  } catch {
    // pgcrypto fallback failed silently
  }

  return false;
};