import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test } from 'vitest';
import pg from 'pg';
import { runner } from 'node-pg-migrate';
import { buildApi } from '../app.js';
import { databaseConfig } from '../database.js';

if (!process.env.PGDATABASE?.endsWith('_test')) throw new Error('Integration tests require an explicitly disposable PGDATABASE ending in _test');
const schema = `clearcsv_test_${randomUUID().replaceAll('-', '')}`;
const pool = new pg.Pool({ ...databaseConfig(), options: `-c search_path=${schema}` });
const app = buildApi(pool, { version: 'integration-v1', origin: 'http://127.0.0.1:4173', logger: false });
const migrationOptions = { databaseUrl: databaseConfig(), dir: 'migrations', schema, migrationsSchema: schema, migrationsTable: 'pgmigrations', createSchema: true, createMigrationsSchema: true, log: () => {}, logger: { info: () => {}, warn: () => {}, error: () => {} } };
const input = { id: randomUUID(), inputRows: 12, outputRows: 10, missingBefore: 6, missingAfter: 0, duplicatesBefore: 2, duplicatesAfter: 0, appVersion: '1.0.0' };
beforeAll(async () => {
  const migrations = await runner({ ...migrationOptions, direction: 'up' });
  expect(migrations.map(m => m.name)).toEqual(['1761955200000_create-processing-runs', '1761955201000_add-app-version']);
});
afterAll(async () => { await app.close(); await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end(); });

test('clean database has both tracked migrations and repeat up is a no-op', async () => {
  expect(await runner({ ...migrationOptions, direction: 'up' })).toHaveLength(0);
  const fields = await pool.query('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2', [schema, 'processing_runs']);
  expect(fields.rows.map(row => row.column_name).sort()).toEqual(['app_version', 'created_at', 'duplicates_after', 'duplicates_before', 'id', 'input_rows', 'missing_after', 'missing_before', 'output_rows']);
  expect((await app.inject('/health')).json()).toEqual({ status: 'ok', version: 'integration-v1' });
});
test('save actual sample counts, retry idempotently, reject conflicting retry, and retrieve durable metadata', async () => {
  const response = await app.inject({ method: 'POST', url: '/api/runs', payload: input });
  expect(response.statusCode).toBe(201);
  expect(response.json()).toMatchObject(input);
  expect(Number.isNaN(Date.parse(response.json().createdAt))).toBe(false);
  expect((await app.inject({ method: 'POST', url: '/api/runs', payload: input })).statusCode).toBe(200);
  expect((await app.inject({ method: 'POST', url: '/api/runs', payload: { ...input, id: input.id.toUpperCase() } })).statusCode).toBe(200);
  expect((await app.inject({ method: 'POST', url: '/api/runs', payload: { ...input, appVersion: '2.0.0' } })).statusCode).toBe(409);
  const list = await app.inject('/api/runs?limit=1');
  expect(list.json().runs).toEqual([response.json()]);
  // A new connection proves the route wrote PostgreSQL, not in-process memory.
  const other = new pg.Pool({ ...databaseConfig(), options: `-c search_path=${schema}` });
  try { expect((await other.query('SELECT input_rows, output_rows FROM processing_runs WHERE id=$1', [input.id])).rows).toEqual([{ input_rows: 12, output_rows: 10 }]); }
  finally { await other.end(); }
});
test('database enforces metadata constraints independently of HTTP', async () => {
  await expect(pool.query('INSERT INTO processing_runs(id,input_rows,output_rows,missing_before,missing_after,duplicates_before,duplicates_after) VALUES ($1,1,9,0,0,0,0)', [randomUUID()])).rejects.toMatchObject({ code: '23514' });
});
test('first migration accepts a row, second adds version, disposable down preserves counts and up recovers schema', async () => {
  const demo = `${schema}_recovery`;
  const opts = { ...migrationOptions, schema: demo, migrationsSchema: demo };
  const client = new pg.Pool({ ...databaseConfig(), options: `-c search_path=${demo}` });
  try {
    expect(await runner({ ...opts, direction: 'up', count: 1 })).toHaveLength(1);
    const id = randomUUID();
    await client.query('INSERT INTO processing_runs(id,input_rows,output_rows,missing_before,missing_after,duplicates_before,duplicates_after) VALUES($1,12,10,6,0,2,0)', [id]);
    await runner({ ...opts, direction: 'up' });
    expect((await client.query('SELECT app_version FROM processing_runs')).rows).toEqual([{ app_version: 'unknown' }]);
    await client.query("UPDATE processing_runs SET app_version='v2'");
    await runner({ ...opts, direction: 'down', count: 1 });
    expect((await client.query('SELECT id,input_rows,output_rows FROM processing_runs')).rows).toEqual([{ id, input_rows: 12, output_rows: 10 }]);
    expect((await client.query('SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name=$3', [demo, 'processing_runs', 'app_version'])).rows[0].n).toBe(0);
    await runner({ ...opts, direction: 'up' });
    expect((await client.query('SELECT app_version FROM processing_runs')).rows).toEqual([{ app_version: 'unknown' }]);
  } finally { await client.query(`DROP SCHEMA IF EXISTS ${demo} CASCADE`); await client.end(); }
});

test('filling without deduplication can create duplicate rows and must remain recordable', async () => {
  const response = await app.inject({ method: 'POST', url: '/api/runs', payload: { ...input, id: randomUUID(), inputRows: 3, outputRows: 3, missingBefore: 1, duplicatesBefore: 0, duplicatesAfter: 1 } });
  expect(response.statusCode).toBe(201);
  expect(response.json().duplicatesAfter).toBe(1);
});
