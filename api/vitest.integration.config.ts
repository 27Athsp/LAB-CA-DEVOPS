import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['api/tests/integration.test.ts'], fileParallelism: false, environment: 'node', testTimeout: 30000, hookTimeout: 30000 } });
