import { readFileSync } from 'node:fs';
import pg from 'pg';

export function databaseConfig(): pg.PoolConfig {
  if (process.env.PGPASSWORD_FILE && process.env.PGPASSWORD) throw new Error('Use one database password source');
  const password = process.env.PGPASSWORD_FILE ? readFileSync(process.env.PGPASSWORD_FILE, 'utf8').trim() : process.env.PGPASSWORD;
  const ssl = process.env.PGSSLMODE === 'verify-full' ? { rejectUnauthorized: true, ...(process.env.PGSSLROOTCERT ? { ca: readFileSync(process.env.PGSSLROOTCERT, 'utf8') } : {}) } : false;
  if (process.env.PGSSLMODE && !['disable', 'verify-full'].includes(process.env.PGSSLMODE)) throw new Error('PGSSLMODE must be disable or verify-full');
  return { host: process.env.PGHOST ?? '127.0.0.1', port: Number(process.env.PGPORT ?? 5432), database: process.env.PGDATABASE ?? 'clearcsv', user: process.env.PGUSER ?? 'clearcsv', password,
    ssl, max: 5, connectionTimeoutMillis: 2000, query_timeout: 5000, statement_timeout: 5000, idleTimeoutMillis: 10000 };
}
export function createPool() {
  const pool = new pg.Pool(databaseConfig());
  pool.on('error', () => console.error(JSON.stringify({ level: 'error', message: 'Idle database connection failed; subsequent requests will reconnect' })));
  return pool;
}
