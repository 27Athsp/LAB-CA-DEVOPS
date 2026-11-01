import Fastify, { LogController } from 'fastify';
import cors from '@fastify/cors';
import type { Pool } from 'pg';

interface RunInput { id: string; inputRows: number; outputRows: number; missingBefore: number; missingAfter: number; duplicatesBefore: number; duplicatesAfter: number; appVersion: string }
const count = { type: 'integer', minimum: 0, maximum: 2_000_000 };
const properties = {
  id: { type: 'string', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' },
  inputRows: { type: 'integer', minimum: 1, maximum: 20_000 }, outputRows: { type: 'integer', minimum: 0, maximum: 20_000 },
  missingBefore: count, missingAfter: count, duplicatesBefore: count, duplicatesAfter: count,
  appVersion: { type: 'string', minLength: 1, maxLength: 100, pattern: '^[a-zA-Z0-9._+-]+$' },
};
const columns = `id, created_at AS "createdAt", input_rows AS "inputRows", output_rows AS "outputRows", missing_before AS "missingBefore", missing_after AS "missingAfter", duplicates_before AS "duplicatesBefore", duplicates_after AS "duplicatesAfter", app_version AS "appVersion"`;

export function buildApi(pool: Pool, options: { version: string; origin: string; logger?: boolean }) {
  const app = Fastify({ logger: options.logger ?? true, logController: new LogController({ disableRequestLogging: true }), bodyLimit: 4096,
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } } });
  // CORS is a browser policy, not authentication. Keep this classroom API behind trusted access.
  app.addHook('onRequest', async (request, reply) => {
    if (request.headers.origin && request.headers.origin !== options.origin) return reply.code(403).send({ error: 'Origin is not allowed' });
  });
  app.register(cors, { origin: options.origin, methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'] });
  app.addHook('onResponse', async (request, reply) => {
    request.log.info({ method: request.method, route: request.routeOptions.url ?? 'unknown', statusCode: reply.statusCode, elapsedMs: reply.elapsedTime }, 'request complete');
  });
  app.setErrorHandler((error, request, reply) => {
    const problem = error as { statusCode?: number; validation?: unknown; code?: string };
    if (problem.validation || problem.statusCode === 400) return reply.code(400).send({ error: 'Invalid run metadata or query. Check the required fields and counts.' });
    if (problem.statusCode === 413) return reply.code(413).send({ error: 'Request body is too large' });
    if (problem.statusCode === 415) return reply.code(415).send({ error: 'Use application/json' });
    // Driver messages/SQL/connection strings are deliberately excluded from logs and HTTP errors.
    request.log.warn({ code: problem.code ?? 'unavailable' }, 'history request failed');
    return reply.code(503).send({ error: 'Run history is temporarily unavailable. Try again shortly.' });
  });
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'Not found' }));
  app.get('/health', async (_request, reply) => {
    try {
      await pool.query('SELECT app_version FROM processing_runs LIMIT 0');
      return { status: 'ok', version: options.version };
    } catch { return reply.code(503).send({ status: 'unavailable', version: options.version }); }
  });
  app.get<{ Querystring: { limit?: string } }>('/api/runs', { schema: { querystring: { type: 'object', additionalProperties: false, properties: { limit: { type: 'string', pattern: '^[0-9]{1,3}$' } } } } }, async (request, reply) => {
    const limit = Number(request.query.limit ?? 20);
    if (limit < 1 || limit > 100) return reply.code(400).send({ error: 'Invalid run metadata or query. Limit must be 1 to 100.' });
    const result = await pool.query(`SELECT ${columns} FROM processing_runs ORDER BY created_at DESC, id DESC LIMIT $1`, [limit]);
    return { runs: result.rows };
  });
  app.post<{ Body: RunInput }>('/api/runs', { schema: { body: { type: 'object', additionalProperties: false, required: Object.keys(properties), properties } } }, async (request, reply) => {
    const run = { ...request.body, id: request.body.id.toLowerCase() };
    if (run.outputRows > run.inputRows || run.missingBefore > run.inputRows * 100 || run.missingAfter > run.outputRows * 100 || run.missingAfter > run.missingBefore || run.duplicatesBefore >= run.inputRows || run.duplicatesAfter > Math.max(0, run.outputRows - 1)) {
      return reply.code(400).send({ error: 'Invalid run metadata: output counts must be consistent with input counts.' });
    }
    const result = await pool.query(`INSERT INTO processing_runs (id,input_rows,output_rows,missing_before,missing_after,duplicates_before,duplicates_after,app_version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING RETURNING ${columns}`,
      [run.id, run.inputRows, run.outputRows, run.missingBefore, run.missingAfter, run.duplicatesBefore, run.duplicatesAfter, run.appVersion]);
    if (result.rows[0]) return reply.code(201).send(result.rows[0]);
    const existing = (await pool.query(`SELECT ${columns} FROM processing_runs WHERE id=$1`, [run.id])).rows[0];
    if (!existing || Object.keys(properties).some((key) => existing[key] !== run[key as keyof RunInput])) return reply.code(409).send({ error: 'This run ID already belongs to different metadata. Clean again to create a new run.' });
    return existing;
  });
  return app;
}
