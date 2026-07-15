import { Request, Response, NextFunction } from 'express';
import { query } from '../db';
import logger from '../logger';

const BLOCKED_CACHE = new Map<string, { status: string; id: string }>();
let lastCacheClean = Date.now();

const BYPASS_PREFIXES = [
  '/api/v1/auth/',
  '/api/v1/admin/ip-blocks',
  '/api/v1/health',
];

function normalizeIP(ip: string): string {
  return ip.replace('::ffff:', '');
}

function getClientIP(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',');
    return ips[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export const ipBlocker = (req: Request, res: Response, next: NextFunction): void => {
  const rawIP = getClientIP(req);
  const ip = normalizeIP(rawIP);

  if (ip === 'unknown' || !ip || BYPASS_PREFIXES.some(p => req.path.startsWith(p))) {
    next();
    return;
  }

  if (Date.now() - lastCacheClean > 60000) {
    BLOCKED_CACHE.clear();
    lastCacheClean = Date.now();
  }

  const cached = BLOCKED_CACHE.get(ip);
  if (cached) {
    if (cached.status === 'active') {
      res.status(403).json({
        error: 'BLOCKED_IP',
        message: 'Your IP has been blocked due to suspicious activity. Contact your administrator.',
        blockId: cached.id,
      });
      return;
    }
    next();
    return;
  }

  (async () => {
    try {
      const result = await query(
        `SELECT id, status FROM ip_blocks
         WHERE ip_address = $1 AND status = 'active'
           AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
         LIMIT 1`,
        [ip]
      );

      if (result.rows.length > 0) {
        const block = result.rows[0];
        BLOCKED_CACHE.set(ip, { status: 'active', id: block.id });

        res.status(403).json({
          error: 'BLOCKED_IP',
          message: 'Your IP has been blocked due to suspicious activity. Contact your administrator.',
          blockId: block.id,
        });
        return;
      }

      BLOCKED_CACHE.set(ip, { status: 'not_blocked', id: '' });
      next();
    } catch (err) {
      logger.error({ err, ip }, 'IP blocker check failed');
      next();
    }
  })();
};

export async function blockIP(
  ipAddress: string,
  reason: 'BRUTE_FORCE' | 'MANUAL' | 'SUSPICIOUS_ACTIVITY',
  blockedBy: string | null,
  affectedUserId: string | null,
  failedAttempts: number,
): Promise<string | null> {
  const ip = normalizeIP(ipAddress);
  if (ip === 'unknown' || !ip) return null;

  try {
    const existing = await query(
      `SELECT id, status FROM ip_blocks
       WHERE ip_address = $1 AND status = 'active'
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
       LIMIT 1`,
      [ip]
    );

    if (existing.rows.length > 0) {
      await query(
        `UPDATE ip_blocks SET failed_attempts = failed_attempts + $1, last_request_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [failedAttempts, existing.rows[0].id]
      );
      return existing.rows[0].id;
    }

    const result = await query(
      `INSERT INTO ip_blocks (ip_address, reason, blocked_by, affected_user_id, failed_attempts, last_request_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '24 hours')
       RETURNING id`,
      [ip, reason, blockedBy, affectedUserId, failedAttempts]
    );

    BLOCKED_CACHE.delete(ip);
    BLOCKED_CACHE.set(ip, { status: 'active', id: result.rows[0].id });
    return result.rows[0].id;
  } catch (err) {
    logger.error({ err, ip }, 'Failed to block IP');
    return null;
  }
}

export async function unblockIP(blockId: string, unblockedBy: string): Promise<boolean> {
  try {
    const result = await query(
      `UPDATE ip_blocks SET status = 'unblocked', notes = COALESCE(notes || ' ', '') || 'Unblocked by admin ' || $2 WHERE id = $1 RETURNING ip_address`,
      [blockId, unblockedBy]
    );

    if (result.rows.length > 0) {
      BLOCKED_CACHE.delete(result.rows[0].ip_address);
      return true;
    }
    return false;
  } catch (err) {
    logger.error({ err, blockId }, 'Failed to unblock IP');
    return false;
  }
}
