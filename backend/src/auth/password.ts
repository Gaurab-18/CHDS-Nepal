import bcrypt from 'bcrypt';
import { query } from '../db';

const SALT_ROUNDS = 12;

export const hashPassword = async (plaintext: string): Promise<string> => {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
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