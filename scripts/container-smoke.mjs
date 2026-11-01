import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

if (existsSync('.env')) loadEnvFile('.env');
const frontend = process.env.FRONTEND_URL || `http://127.0.0.1:${process.env.FRONTEND_PORT || 8080}`;
const api = process.env.API_URL || `http://127.0.0.1:${process.env.API_PORT || 3000}`;
const version = process.env.APP_VERSION || '1.0.0';
async function request(base, path, options) {
  return fetch(new URL(path, base), { signal: AbortSignal.timeout(5000), ...options });
}
for (const [base, path] of [[frontend, '/health'], [frontend, '/api-health'], [api, '/health']]) {
  const response = await request(base, path);
  assert.equal(response.status, 200, `${base}${path} is ready`);
  if (path !== '/health' || base === api) {
    assert.match(response.headers.get('content-type') ?? '', /application\/json/, 'Expected the ClearCSV API JSON response; check the configured port');
    assert.deepEqual(await response.json(), { status: 'ok', version });
  }
}
const html = await request(frontend, '/');
assert.equal(html.status, 200);
assert.match(await html.text(), /ClearCSV/);
assert.match(html.headers.get('content-security-policy'), /connect-src 'self'/);
const config = await request(frontend, '/config.json');
assert.deepEqual(await config.json(), { apiUrl: '', appVersion: version, historyEnabled: true });
const run = {
  id: randomUUID(), inputRows: 6, outputRows: 4,
  missingBefore: 2, missingAfter: 0, duplicatesBefore: 2, duplicatesAfter: 0,
  appVersion: version,
};
for (let attempt = 0; attempt < 2; attempt++) {
  const response = await request(frontend, '/api/runs', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(run),
  });
  assert.ok([200, 201].includes(response.status), `save returns ${response.status}`);
}
const list = await request(frontend, '/api/runs');
assert.equal(list.status, 200);
const { runs } = await list.json();
const saved = runs.filter(item => item.id === run.id);
assert.equal(saved.length, 1, 'retry does not duplicate the record');
for (const [key, value] of Object.entries(run)) assert.equal(saved[0][key], value, key);
const invalid = await request(frontend, '/api/runs', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...run, id: randomUUID(), inputRows: -1, filename: 'private.csv' }),
});
assert.equal(invalid.status, 400, 'invalid or identifying metadata is rejected');
console.log(`Container smoke passed: frontend, proxy, API, schema validation, idempotence, version ${version}`);
