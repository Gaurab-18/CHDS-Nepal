import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db';
import logger from '../logger';

export interface JwtPayload {
  id: string;
  email: string;
  role: string;
  token_version?: number;
  is_verified?: boolean;
}

// Extend Express Request to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return secret;
};

const PASS_THROUGH_ROUTES = ['/change-password', '/ip-blocks'];

/**
 * Middleware: Reads access_token from httpOnly cookie, verifies JWT,
 * checks account active, token_version, and must_change_password.
 * Returns 401 if token missing or invalid.
 */
export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  const token = req.cookies?.access_token;

  if (!token) {
    res.status(401).json({ error: 'Authentication required. No access token provided.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as JwtPayload;
    req.user = decoded;
    (async () => {
      try {
        const result = await query(
          'SELECT active, token_version, must_change_password FROM users WHERE id = $1',
          [decoded.id]
        );

        if (!result.rows.length) {
          res.status(401).json({ error: 'User not found' });
          return;
        }

        const user = result.rows[0];

        if (!user.active) {
          res.status(403).json({ error: 'ACCOUNT_DISABLED', message: 'Account has been disabled' });
          return;
        }

        if (user.token_version !== (decoded.token_version || 0)) {
          res.status(401).json({ error: 'Token version mismatch. Please log in again.' });
          return;
        }

        if (user.must_change_password && !PASS_THROUGH_ROUTES.some(p => req.path === p || req.path.startsWith(p + '/'))) {
          res.status(403).json({ error: 'MUST_CHANGE_PASSWORD', message: 'You must change your password before proceeding' });
          return;
        }

        next();
      } catch (dbErr) {
        logger.error({ err: dbErr }, 'Auth DB check failed');
        next();
      }
    })();
  } catch (err) {
    logger.warn({ err }, 'JWT verification failed');
    res.status(401).json({ error: 'Invalid or expired access token' });
  }
};

/**
 * Middleware factory: Checks that req.user.role is in the allowed roles list.
 * Must be used AFTER authenticate middleware.
 * Returns 401 if not authenticated, 403 if role not authorized.
 */
export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      logger.warn(
        { userId: req.user.id, role: req.user.role, requiredRoles: roles },
        'RBAC: Access denied - insufficient role'
      );
      res.status(403).json({ error: 'Forbidden: insufficient permissions for this resource' });
      return;
    }

    next();
  };
};
