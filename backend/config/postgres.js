import dotenv from 'dotenv';
import { Pool } from 'pg';
import logger from '../utils/logger.js';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('Missing DATABASE_URL in environment');
}

const isLocalhost =
  connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

function resolveSsl() {
  if (process.env.DATABASE_SSL === 'false' || isLocalhost) {
    return undefined;
  }
  return { rejectUnauthorized: false };
}

const ssl = resolveSsl();

logger.info('[PG] Pool created', {
  ssl: ssl ? 'enabled (rejectUnauthorized=false)' : 'disabled',
  isLocalhost,
});

export const pool = new Pool({
  connectionString,
  ssl,
});

