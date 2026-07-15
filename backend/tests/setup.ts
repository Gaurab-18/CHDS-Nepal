import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.NODE_ENV = 'test';
