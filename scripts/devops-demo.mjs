// All destructive operations are restricted to this fixed, disposable Compose project.
// No production environment files, volumes, services, hosts or registry are used.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const directory = resolve('.devops-demo');
mkdirSync(directory, { recursive: true, mode: 0o700 });
chmodSync(directory, 0o700);
const password = resolve(directory, 'postgres_password');
if (!existsSync(password)) writeFileSync(password, randomBytes(32).toString('hex'), { mode: 0o600 });
// Compose bind secrets retain host modes. Private parent + read-only file lets UID1000 read the mount.
chmodSync(password, 0o444);
const project = 'clearcsv-disposable-demo';
const env = { ...process.env, COMPOSE_PROJECT_NAME: project, POSTGRES_PASSWORD_FILE: password, FRONTEND_PORT: '18080', API_PORT: '13000', CORS_ORIGIN: 'http://127.0.0.1:18080', API_UPSTREAM: 'api:3000', PGDATABASE: 'clearcsv', PGUSER: 'clearcsv', FRONTEND_IMAGE: 'clearcsv-frontend', API_IMAGE: 'clearcsv-api' };
// Explicit args/file prevent an unrelated user's COMPOSE_FILE/.env project settings being used.
const compose = ['compose', '--project-name', project, '--env-file', resolve(directory, 'demo.env'), '-f', resolve('compose.yaml')];
writeFileSync(resolve(directory, 'demo.env'), '# Disposable demonstration. Secrets are in a separate ignored file.\n');
let version = '1.0.0-demo.1';
function docker(args, options = {}) {
  return execFileSync('docker', args, { env: { ...env, VERSION: version, APP_VERSION: version }, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
}
function dc(args, options) { return docker([...compose, ...args], options); }
function sql(database, statement) {
  return dc(['exec', '-T', 'db', 'psql', '-U', 'clearcsv', '-d', database, '-v', 'ON_ERROR_STOP=1', '-At', '-c', statement]).trim();
}
function createDatabase(name) { dc(['exec', '-T', 'db', 'createdb', '-U', 'clearcsv', name]); }
function dump(database) { return dc(['exec', '-T', 'db', 'pg_dump', '-U', 'clearcsv', '-d', database, '--no-owner', '--no-privileges']); }
function restore(database, backup) { dc(['exec', '-T', 'db', 'psql', '-U', 'clearcsv', '-d', database, '-v', 'ON_ERROR_STOP=1', '--single-transaction'], { input: backup }); }
function migrate(database, direction = 'up', count) {
  return dc(['run', '--rm', '--no-deps', '-e', `PGDATABASE=${database}`, ...(direction === 'down' ? ['-e', 'ALLOW_DB_ROLLBACK=disposable'] : []), 'api', 'node', 'dist-api/migrate.js', direction, ...(count ? [String(count)] : [])]);
}
async function request(path, options) { return fetch(`http://127.0.0.1:18080${path}`, { signal: AbortSignal.timeout(8000), ...options }); }
async function ready() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await request('/api-health');
      if (response.ok && (await response.json()).version === version) {
        const config = await (await request('/config.json')).json();
        assert.equal(config.appVersion, version);
        assert.equal(config.historyEnabled, true);
        return;
      }
    } catch { /* a restarting service is expected */ }
    await delay(1000);
  }
  throw new Error(`Release ${version} never became ready`);
}
const checks = [];
function pass(message) { checks.push(message); console.log(`PASS: ${message}`); }
async function save() {
  const payload = { id: randomUUID(), inputRows: 12, outputRows: 10, missingBefore: 6, missingAfter: 0, duplicatesBefore: 2, duplicatesAfter: 0, appVersion: version };
  const response = await request('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ...payload, createdAt: (await records()).find(run => run.id === payload.id).createdAt });
  return payload;
}
async function records() {
  const response = await request('/api/runs?limit=100');
  assert.equal(response.status, 200); return (await response.json()).runs;
}
if (process.argv[2] === 'cleanup') {
  dc(['down', '--volumes', '--remove-orphans']);
  console.log('Removed only clearcsv-disposable-demo containers and its disposable volume.');
  process.exit(0);
}
assert.ok(!process.argv[2], 'Usage: node scripts/devops-demo.mjs [cleanup]');
assert.equal(dc(['ps', '-a', '-q']).trim(), '', 'Demo already exists. Run this script with cleanup before a fresh demonstration.');

try {
  console.log(`Disposable project ${project}; frontend http://127.0.0.1:18080. First run builds images.`);
  dc(['build'], { stdio: 'inherit' });
  dc(['up', '-d', '--wait', '--wait-timeout', '180'], { stdio: 'inherit' });
  await ready(); const first = await save();
  pass('Release 1 is healthy; actual sample metadata stored');
  const imageUsers = ['api', 'frontend'].map(service => docker(['inspect', '--format', '{{.Config.User}}', dc(['ps', '-q', service]).trim()]).trim());
  assert.ok(imageUsers.every(user => user && user !== '0' && user !== 'root'));
  pass('Both application containers run as non-root users');

  dc(['up', '-d', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '90', 'db'], { stdio: 'inherit' });
  await ready();
  assert.ok((await records()).some(run => run.id === first.id));
  pass('Metadata survives PostgreSQL container recreation using the same named volume');

  const backup = dump('clearcsv');
  writeFileSync(resolve(directory, 'metadata-backup.sql'), backup, { mode: 0o600 });
  createDatabase('clearcsv_restore_test'); restore('clearcsv_restore_test', backup);
  assert.equal(sql('clearcsv_restore_test', `SELECT input_rows||','||output_rows FROM processing_runs WHERE id='${first.id}'`), '12,10');
  pass('pg_dump backup restored into a separate disposable database with the original row');

  dc(['stop', 'db'], { stdio: 'inherit' });
  assert.equal((await request('/api-health')).status, 503);
  assert.equal((await request('/health')).status, 200);
  dc(['up', '-d', '--no-deps', '--wait', '--wait-timeout', '90', 'db'], { stdio: 'inherit' });
  await ready(); assert.ok((await records()).some(run => run.id === first.id));
  pass('Database outage gives API 503 while frontend remains available; API reconnects after recovery');

  version = '1.0.0-demo.2';
  dc(['build'], { stdio: 'inherit' });
  dc(['up', '-d', '--no-deps', '--wait', '--wait-timeout', '120', 'api', 'frontend'], { stdio: 'inherit' });
  await ready(); const second = await save();
  pass('Release 2 uses separate image tags and shows a new version in the UI and API health');

  const bad = resolve(directory, 'bad-release.json');
  writeFileSync(bad, JSON.stringify({ services: { api: { command: ['node', '-e', 'process.exit(42)'], restart: 'no' } } }));
  docker([...compose, '-f', bad, 'up', '-d', '--no-deps', 'api']);
  const failedContainer = dc(['ps', '-a', '-q', 'api']).trim();
  for (let attempt = 0; attempt < 20; attempt++) {
    if (docker(['inspect', '--format', '{{.State.Running}}', failedContainer]).trim() === 'false') break;
    await delay(250);
  }
  assert.equal(docker(['inspect', '--format', '{{.State.ExitCode}}', failedContainer]).trim(), '42');
  assert.ok(!(await request('/api-health')).ok);
  pass('Controlled bad release fails container/HTTP verification only in disposable staging');

  version = '1.0.0-demo.1';
  dc(['up', '-d', '--no-deps', '--wait', '--wait-timeout', '120', 'api', 'frontend'], { stdio: 'inherit' });
  await ready();
  const retained = await records();
  assert.ok(retained.some(run => run.id === first.id) && retained.some(run => run.id === second.id));
  pass('Application rollback redeploys release 1 images; both release records remain in PostgreSQL');

  createDatabase('clearcsv_migration_test');
  migrate('clearcsv_migration_test', 'up', 1);
  const migrationId = randomUUID();
  sql('clearcsv_migration_test', `INSERT INTO processing_runs(id,input_rows,output_rows,missing_before,missing_after,duplicates_before,duplicates_after) VALUES('${migrationId}',12,10,6,0,2,0)`);
  assert.equal(sql('clearcsv_migration_test', "SELECT count(*) FROM information_schema.columns WHERE table_name='processing_runs' AND column_name='app_version'"), '0');
  migrate('clearcsv_migration_test');
  sql('clearcsv_migration_test', "UPDATE processing_runs SET app_version='before-rollback'");
  const preMigrationDownBackup = dump('clearcsv_migration_test');
  writeFileSync(resolve(directory, 'pre-down-backup.sql'), preMigrationDownBackup, { mode: 0o600 });
  migrate('clearcsv_migration_test', 'down', 1);
  assert.equal(sql('clearcsv_migration_test', 'SELECT input_rows||\',\'||output_rows FROM processing_runs'), '12,10');
  assert.equal(sql('clearcsv_migration_test', "SELECT count(*) FROM information_schema.columns WHERE table_name='processing_runs' AND column_name='app_version'"), '0');
  migrate('clearcsv_migration_test');
  assert.equal(sql('clearcsv_migration_test', 'SELECT app_version FROM processing_runs'), 'unknown');
  createDatabase('clearcsv_recovered_test'); restore('clearcsv_recovered_test', preMigrationDownBackup);
  assert.equal(sql('clearcsv_recovered_test', 'SELECT app_version FROM processing_runs'), 'before-rollback');
  pass('Separate disposable migration demo: first schema + row, additive second schema, down one, up recovery, full backup restores dropped version values');
  writeFileSync(resolve(directory, 'results.json'), JSON.stringify({ checkedAt: new Date().toISOString(), project, version, checks, firstRunId: first.id, secondRunId: second.id, remoteDeploymentTested: false, registryPublished: false }, null, 2));
  console.log('All local demonstrations passed. Staging is left running at release 1. Run: node scripts/devops-demo.mjs cleanup');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Demo failed');
  console.error('Disposable resources retained for inspection. No production resources were changed.');
  process.exitCode = 1;
}
