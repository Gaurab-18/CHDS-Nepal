import { createClient } from 'redis';
import logger from './logger';

const redisHost = process.env.REDIS_HOST || 'redis';
const redisPort = process.env.REDIS_PORT || '6379';

const redisClient = createClient({
  url: `redis://${redisHost}:${redisPort}`
});

redisClient.on('error', (err) => {
  logger.error({ err }, 'Redis Client Error');
});

redisClient.on('connect', () => {
  logger.info('Redis connection establishing...');
});

redisClient.on('ready', () => {
  logger.info('Redis client connected and ready to use');
});

// Initialize connection
(async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    logger.error({ err }, 'Could not start Redis connection on server init');
  }
})();

export default redisClient;
