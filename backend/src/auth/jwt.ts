import jwt, { SignOptions, VerifyOptions } from 'jsonwebtoken';
import { Request, Response } from 'express';
import crypto from 'crypto';
import logger from '../logger';
import { JwtPayload } from '../middleware/authorize';

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return secret;
};

const getRefreshSecret = (): string => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new Error('JWT_REFRESH_SECRET environment variable is not set');
  return secret;
};

export const ACCESS_TOKEN_EXPIRY = '15m';
export const REFRESH_TOKEN_EXPIRY = '7d';

export const generateAccessToken = (payload: JwtPayload & { token_version?: number }): string => {
  const options: SignOptions = {
    expiresIn: ACCESS_TOKEN_EXPIRY,
    issuer: 'chds-nepal',
    audience: 'chds-client'
  };
  return jwt.sign(payload, getJwtSecret(), options);
};

export const generateRefreshToken = (payload: JwtPayload & { token_version?: number }): string => {
  const options: SignOptions = {
    expiresIn: REFRESH_TOKEN_EXPIRY,
    issuer: 'chds-nepal',
    audience: 'chds-client',
    jwtid: crypto.randomBytes(16).toString('hex')
  };
  return jwt.sign(payload, getRefreshSecret(), options);
};

export const verifyAccessToken = (token: string): JwtPayload => {
  const options: VerifyOptions = {
    issuer: 'chds-nepal',
    audience: 'chds-client'
  };
  return jwt.verify(token, getJwtSecret(), options) as JwtPayload;
};

export const verifyRefreshToken = (token: string): JwtPayload => {
  const options: VerifyOptions = {
    issuer: 'chds-nepal',
    audience: 'chds-client'
  };
  return jwt.verify(token, getRefreshSecret(), options) as JwtPayload;
};

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict' as const,
  path: '/'
};

export const setAuthCookies = (
  res: Response,
  accessToken: string,
  refreshToken: string
): void => {
  res.cookie('access_token', accessToken, {
    ...COOKIE_OPTIONS,
    maxAge: 15 * 60 * 1000
  });

  res.cookie('refresh_token', refreshToken, {
    ...COOKIE_OPTIONS,
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  logger.debug('Auth cookies set with httpOnly, Secure, SameSite=Strict');
};

export const clearAuthCookies = (res: Response): void => {
  res.clearCookie('access_token', { ...COOKIE_OPTIONS, maxAge: 0 });
  res.clearCookie('refresh_token', { ...COOKIE_OPTIONS, maxAge: 0 });
  logger.debug('Auth cookies cleared');
};

export const getRefreshTokenFromCookies = (req: Request): string | undefined => {
  return req.cookies?.refresh_token;
};

export const generateResetToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

export const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// ── Refresh token rotation (single-use) ──────────────────────────────
// Refresh tokens are stored hashed in refresh_tokens. Each use revokes
// the presented token and (in the route) issues a brand-new one, so a
// stolen token cannot be replayed after rotation.

import { query } from '../db';

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const storeRefreshToken = async (userId: string, token: string): Promise<void> => {
  const tokenHash = hashToken(token);
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + ($3::bigint || ' milliseconds')::interval)`,
    [userId, tokenHash, REFRESH_TTL_MS]
  );
};

// Marks the presented token as used. Returns true if it was valid (present + not revoked).
export const consumeRefreshToken = async (userId: string, token: string): Promise<boolean> => {
  const tokenHash = hashToken(token);
  const { rows } = await query(
    `UPDATE refresh_tokens
     SET revoked_at = NOW()
     WHERE user_id = $1 AND token_hash = $2 AND revoked_at IS NULL AND expires_at > NOW()
     RETURNING id`,
    [userId, tokenHash]
  );
  return rows.length > 0;
};

export const revokeAllRefreshTokens = async (userId: string): Promise<void> => {
  await query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
};