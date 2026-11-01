import { setTimeout as delay } from 'node:timers/promises';
import { buildApi } from './app.js';
import { createPool } from './database.js';

const version = process.env.APP_VERSION ?? '1.0.0';
const origin = process.env.CORS_ORIGIN ?? 'http://127.0.0.1:4173';
if (new URL(origin).origin !== origin) throw new Error('CORS_ORIGIN must be one exact HTTP(S) origin');
const pool = createPool();
const app = buildApi(pool, { version, origin });
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(1), 10000).unref();
  await app.close(); await pool.end(); clearTimeout(timeout);
}
process.once('SIGTERM', () => { void stop(); });
process.once('SIGINT', () => { void stop(); });
try {
  // Compose also waits for PostgreSQL health. This bounded retry covers separate hosts/restarts.
  for (let attempt = 1; ; attempt++) {
    try { await pool.query('SELECT app_version FROM processing_runs LIMIT 0'); break; }
    catch {
      if (attempt >= 15 || stopping) throw new Error('Database or schema unavailable');
      console.warn(JSON.stringify({ level: 'warn', message: 'Waiting for database and migrations', attempt }));
      await delay(1000);
    }
  }
  if (!stopping) await app.listen({ host: process.env.HOST ?? '0.0.0.0', port: Number(process.env.PORT ?? 3000) });
} catch {
  console.error(JSON.stringify({ level: 'error', message: 'API startup failed. Check database access, migrations and listen port.' }));
  await stop(); process.exitCode = 1;
}
