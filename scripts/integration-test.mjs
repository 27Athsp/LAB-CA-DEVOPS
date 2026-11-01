// One-command real PostgreSQL tests. Only this randomly named container is removed.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const directory = mkdtempSync(join(tmpdir(), 'clearcsv-pg-test-'));
chmodSync(directory, 0o700);
const password = randomBytes(32).toString('hex');
const passwordFile = join(directory, 'password');
writeFileSync(passwordFile, password, { mode: 0o444 });
const name = `clearcsv-test-${randomBytes(5).toString('hex')}`;
const docker = (args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
let started = false;
try {
  docker(['run', '--detach', '--name', name, '--publish', '127.0.0.1::5432', '--mount', `type=bind,source=${passwordFile},target=/run/secrets/password,readonly`, '--env', 'POSTGRES_PASSWORD_FILE=/run/secrets/password', '--env', 'POSTGRES_DB=clearcsv_test', 'postgres:17.6-alpine']);
  started = true;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { docker(['exec', name, 'pg_isready', '-U', 'postgres', '-d', 'clearcsv_test']); ready = true; break; } catch { await delay(1000); }
  }
  if (!ready) throw new Error('Disposable PostgreSQL did not become ready');
  const port = docker(['inspect', '--format', '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}', name]);
  const env = { ...process.env, PGHOST: '127.0.0.1', PGPORT: port, PGDATABASE: 'clearcsv_test', PGUSER: 'postgres', PGPASSWORD: password, PGSSLMODE: 'disable' };
  delete env.PGPASSWORD_FILE;
  execFileSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'api/vitest.integration.config.ts'], { env, stdio: 'inherit' });
} catch (error) {
  console.error('PostgreSQL integration check failed. Check Docker availability and test output above.');
  process.exitCode = 1;
} finally {
  if (started) docker(['rm', '--force', '--volumes', name]);
  rmSync(directory, { recursive: true, force: true });
}
