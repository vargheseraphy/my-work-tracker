import { defineWorkspace } from 'vitest/config';

/**
 * Three suites (docs/TESTING.md):
 *   shared   pure logic, no database
 *   server   Fastify routes and database rules, against gtm_test
 *   web      component and hook unit tests in jsdom
 * Browser journeys run separately through Playwright (`npm run e2e`).
 */
export default defineWorkspace([
  {
    test: {
      name: 'shared',
      root: './packages/shared',
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'server',
      root: './apps/server',
      environment: 'node',
      include: ['src/**/*.test.ts'],
      setupFiles: ['./src/test/setup.ts'],
      globalSetup: ['./src/test/global-setup.ts'],
      hookTimeout: 60_000,
      testTimeout: 30_000,
      // The database is shared state: one file at a time keeps the rules tests honest.
      fileParallelism: false,
      pool: 'forks',
    },
  },
  {
    test: {
      name: 'web',
      root: './apps/web',
      environment: 'jsdom',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  },
]);
