import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['api/tests/app.test.ts'], environment: 'node', testTimeout: 20000, hookTimeout: 30000 } });
