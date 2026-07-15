import { Pool } from 'pg';
import logger from './logger';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'chds_db',
  user: process.env.APP_USER || 'app_user',
  password: process.env.APP_USER_PASSWORD || 'change_me_app_user_password',
});

pool.on('connect', () => {
  logger.info('Database pool: new client connected as app_user');
});

pool.on('error', (err: Error) => {
  logger.error({ err }, 'Unexpected error on idle database client');
  process.exit(-1);
});

export const query = (text: string, params?: any[]) => pool.query(text, params);

export default pool;
