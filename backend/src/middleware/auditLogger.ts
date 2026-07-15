import { Request, Response, NextFunction } from 'express';
import { query } from '../db';
import logger from '../logger';

/**
 * Directly insert an audit log entry.
 * Use this in route handlers where you need to log with specific actor/target info
 * (e.g., after login when req.user is not yet set by middleware).
 */
export const insertAuditLog = async (
  actorId: string | null,
  action: string,
  targetId: string | null,
  ipAddress: string,
  userAgent: string,
  overrideReason?: string
): Promise<void> => {
  try {
    if (overrideReason) {
      await query(
        `INSERT INTO audit_log (actor_id, action, target_id, ip_address, user_agent, override_reason)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [actorId, action, targetId, ipAddress, userAgent, overrideReason]
      );
    } else {
      await query(
        `INSERT INTO audit_log (actor_id, action, target_id, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5)`,
        [actorId, action, targetId, ipAddress, userAgent]
      );
    }
  } catch (err) {
    logger.error({ err, action, actorId }, 'Failed to write audit log entry');
  }
};

/**
 * Express middleware factory: Logs an audit entry after the response is sent.
 * Reads actor from req.user (set by authenticate middleware).
 * Use on routes where the user is already authenticated.
 */
export const auditLog = (action: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.on('finish', () => {
      const actorId = req.user?.id || null;
      const targetId = req.params?.id || null;
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
      const userAgent = req.get('User-Agent') || 'unknown';

      insertAuditLog(actorId, action, targetId, ipAddress, userAgent);
    });

    next();
  };
};
