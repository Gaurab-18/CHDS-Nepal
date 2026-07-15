import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { encryptText, decryptText } from '../crypto';
import { query } from '../db';
import logger from '../logger';

authenticator.options = {
  step: 30,
  window: 1
};

export const generateTOTPSecret = (): string => {
  return authenticator.generateSecret();
};

export const generateTOTPURI = (secret: string, email: string): string => {
  return authenticator.keyuri(email, 'CHDS Nepal', secret);
};

export const generateQRCode = async (otpAuthUrl: string): Promise<string> => {
  return QRCode.toDataURL(otpAuthUrl);
};

export const verifyTOTP = (token: string, secret: string): boolean => {
  try {
    return authenticator.verify({ token, secret });
  } catch (err) {
    logger.warn({ err }, 'TOTP verification error');
    return false;
  }
};

export const setupTOTP = async (userId: string, email: string): Promise<{
  secret: string;
  qrCode: string;
}> => {
  const secret = generateTOTPSecret();
  const otpAuthUrl = generateTOTPURI(secret, email);
  const qrCode = await generateQRCode(otpAuthUrl);

  const encryptedSecret = await encryptText(secret);
  await query(
    'UPDATE users SET two_factor_secret = $1, two_factor_enabled = $2 WHERE id = $3',
    [encryptedSecret, false, userId]
  );

  logger.info({ userId }, 'TOTP setup initiated for user');
  return { secret, qrCode };
};

export const enableTOTP = async (userId: string, token: string): Promise<boolean> => {
  const result = await query(
    'SELECT two_factor_secret FROM users WHERE id = $1',
    [userId]
  );

  if (!result.rows.length || !result.rows[0].two_factor_secret) {
    logger.warn({ userId }, 'TOTP enable failed: no secret found');
    return false;
  }

  const decryptedSecret = await decryptText(result.rows[0].two_factor_secret);

  if (!verifyTOTP(token, decryptedSecret)) {
    logger.warn({ userId }, 'TOTP enable failed: invalid token');
    return false;
  }

  await query(
    'UPDATE users SET two_factor_enabled = $1 WHERE id = $2',
    [true, userId]
  );

  logger.info({ userId }, 'TOTP enabled successfully');
  return true;
};

export const verifyTOTPForUser = async (userId: string, token: string): Promise<boolean> => {
  const result = await query(
    'SELECT two_factor_secret, two_factor_enabled FROM users WHERE id = $1',
    [userId]
  );

  if (!result.rows.length || !result.rows[0].two_factor_enabled) {
    return false;
  }

  const decryptedSecret = await decryptText(result.rows[0].two_factor_secret);
  return verifyTOTP(token, decryptedSecret);
};