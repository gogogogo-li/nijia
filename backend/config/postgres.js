import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('Missing DATABASE_URL in environment');
}

// Supabase 托管 Postgres 往往需要 SSL，但 CA 可能不在默认信任链里
const ssl =
  connectionString.includes('supabase.co') || connectionString.includes('supabase.com')
    ? { rejectUnauthorized: false }
    : undefined;

export const pool = new Pool({
  connectionString,
  ssl,
});

