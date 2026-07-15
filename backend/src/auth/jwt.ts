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
    audience: 'chds-client'
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