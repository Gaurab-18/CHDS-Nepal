import { Router, Request, Response } from 'express';
import { query } from '../db';
import { authenticate } from '../middleware/authorize';
import logger from '../logger';

const router = Router();

router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT id, type, link, title, message, is_read, created_at
       FROM notifications WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [req.user!.id]
    );
    const unreadResult = await query(
      'SELECT COUNT(*) as cnt FROM notifications WHERE user_id = $1 AND is_read = false',
      [req.user!.id]
    );
    res.json({
      notifications: result.rows,
      unread_count: parseInt(unreadResult.rows[0].cnt),
    });
  } catch (err) {
    logger.error({ err }, 'Fetch notifications error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/unread-count', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await query(
      'SELECT COUNT(*) as cnt FROM notifications WHERE user_id = $1 AND is_read = false',
      [req.user!.id]
    );
    res.json({ unread_count: parseInt(result.rows[0].cnt) });
  } catch (err) {
    logger.error({ err }, 'Unread count error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id/read', authenticate, async (req: Request, res: Response) => {
  try {
    await query(
      `UPDATE notifications SET is_read = true, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user!.id]
    );
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    logger.error({ err }, 'Mark notification read error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/read-all', authenticate, async (_req: Request, res: Response) => {
  try {
    await query(
      `UPDATE notifications SET is_read = true, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND is_read = false`,
      [_req.user!.id]
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    logger.error({ err }, 'Mark all read error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
