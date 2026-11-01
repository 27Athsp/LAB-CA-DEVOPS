import { afterAll, describe, expect, test } from 'vitest';
import pg from 'pg';
import { buildApi } from '../app.js';

// A real unreachable PostgreSQL address exercises the outage boundary, not a fake repository.
const pool = new pg.Pool({ host: '127.0.0.1', port: 1, user: 'test', database: 'test', connectionTimeoutMillis: 100 });
const app = buildApi(pool, { version: 'test-v1', origin: 'http://localhost:4173', logger: false });
afterAll(async () => { await app.close(); await pool.end(); });
const valid = { id: 'df3adbd0-c2d1-4cb9-9b0e-81f0c54e9813', inputRows: 12, outputRows: 10, missingBefore: 6, missingAfter: 0, duplicatesBefore: 2, duplicatesAfter: 0, appVersion: '1.0.0' };

describe('API validation and outage behavior', () => {
  test('readiness reports database unavailable without leaking connection settings', async () => {
    const response = await app.inject('/health');
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'unavailable', version: 'test-v1' });
  });
  test('history failure is meaningful and does not leak driver details', async () => {
    const response = await app.inject('/api/runs');
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'Run history is temporarily unavailable. Try again shortly.' });
  });
  test.each([
    { ...valid, inputRows: -1 }, { ...valid, inputRows: '12' },
    { ...valid, outputRows: 13 }, { ...valid, missingAfter: 7 },
    { ...valid, duplicatesAfter: 11 }, { ...valid, id: 'bad' },
    { ...valid, appVersion: '' }, { ...valid, csv: 'name,age\nPrivate,20' },
    { ...valid, missingBefore: 1201 }, { ...valid, duplicatesBefore: 12 },
  ])('rejects invalid/extra metadata before accessing the database: %j', async (payload) => {
    const response = await app.inject({ method: 'POST', url: '/api/runs', payload });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/metadata/i);
  });
  test.each(['/api/runs?limit=0', '/api/runs?limit=101', '/api/runs?limit=abc', '/api/runs?csv=secret'])('rejects unbounded/unknown query %s', async (url) => {
    expect((await app.inject(url)).statusCode).toBe(400);
  });
  test('denies untrusted origins and allows the configured origin preflight', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/runs', headers: { origin: 'https://untrusted.example' }, payload: valid })).statusCode).toBe(403);
    const allowed = await app.inject({ method: 'OPTIONS', url: '/api/runs', headers: { origin: 'http://localhost:4173', 'access-control-request-method': 'POST' } });
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:4173');
  });
  test('rejects malformed/oversized JSON without exposing submitted data', async () => {
    const malformed = await app.inject({ method: 'POST', url: '/api/runs', headers: { 'content-type': 'application/json' }, payload: '{"csv":"private"' });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.body).not.toContain('private');
    const large = await app.inject({ method: 'POST', url: '/api/runs', payload: { csv: 'x'.repeat(5000) } });
    expect(large.statusCode).toBe(413);
  });
  test('unknown endpoints return JSON 404', async () => {
    expect((await app.inject('/missing')).json()).toEqual({ error: 'Not found' });
  });
});
