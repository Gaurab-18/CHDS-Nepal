import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import redisClient from './redisClient';
import logger from './logger';

const disableRateLimit = process.env.DISABLE_RATE_LIMIT === 'true';
const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '') || 15 * 60 * 1000;
const maxRequests = parseInt(process.env.RATE_LIMIT_MAX || '') || 100;

export const rateLimiter = disableRateLimit
  ? (_req: any, _res: any, next: any) => next()
  : rateLimit({
      windowMs, // 15 minutes default
      limit: maxRequests, // 100 requests per window default
      standardHeaders: 'draft-6',
      legacyHeaders: false,
      message: {
        status: 429,
        error: 'Too Many Requests',
        message: 'Too many requests from this IP, please try again after 15 minutes'
      },
      store: new RedisStore({
        sendCommand: async (...args: string[]) => {
          return redisClient.sendCommand(args);
        },
      }),
      handler: (req, res, _next, options) => {
        logger.warn({ ip: req.ip, path: req.originalUrl }, 'Rate limit exceeded');
        res.status(options.statusCode).json(options.message);
      }
    });
