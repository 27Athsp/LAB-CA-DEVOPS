import { runner } from 'node-pg-migrate';
import { databaseConfig } from './database.js';
const direction = process.argv[2] ?? 'up';
const count = process.argv[3] === undefined ? undefined : Number(process.argv[3]);
if (!['up', 'down'].includes(direction) || (count !== undefined && (!Number.isSafeInteger(count) || count < 1))) throw new Error('Usage: migrate.js up [count] | down 1');
if (direction === 'down' && (process.env.ALLOW_DB_ROLLBACK !== 'disposable' || count !== 1)) throw new Error('Down is restricted to one step in a disposable database: ALLOW_DB_ROLLBACK=disposable and down 1');
try {
  const applied = await runner({ databaseUrl: databaseConfig(), dir: 'migrations', migrationsTable: 'pgmigrations', direction: direction as 'up' | 'down', count,
    log: () => {}, logger: { info: () => {}, warn: () => {}, error: () => {} } });
  console.log(JSON.stringify({ direction, migrations: applied.map((migration) => migration.name) }));
} catch {
  console.error('Migration failed. Check database availability, permissions and migration state. No credentials are logged.');
  process.exitCode = 1;
}
