/**
 * The auth rate limit, checked on its own. The rest of the suite raises AUTH_RATE_LIMIT so that
 * signing in hundreds of times does not trip it; this file puts a real limit back.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { buildConfig, resetConfig } from '../config.js';
import { closeOwner } from '../test/helpers.js';

let app: FastifyInstance;
const previous = process.env.AUTH_RATE_LIMIT;

beforeAll(async () => {
  process.env.AUTH_RATE_LIMIT = '3';
  resetConfig();
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  process.env.AUTH_RATE_LIMIT = previous;
  resetConfig();
  await closeOwner();
});

describe('auth routes are rate limited', () => {
  it('answers 429 once the limit is passed', async () => {
    const attempt = () =>
      app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { 'x-requested-with': 'gtm' },
        payload: { email: 'nobody@example.test', password: 'whatever-it-is' },
      });

    const codes: number[] = [];
    for (let i = 0; i < 5; i += 1) codes.push((await attempt()).statusCode);

    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0);
    const limited = codes.lastIndexOf(429);
    expect(limited).toBeGreaterThanOrEqual(3);
  });

  it('does not limit the rest of the API as tightly', async () => {
    for (let i = 0; i < 10; i += 1) {
      const response = await app.inject({ method: 'GET', url: '/api/health' });
      expect(response.statusCode).toBe(200);
    }
  });
});

describe('the shipped default', () => {
  it('is 20 requests per 15 minutes, as the technical specification says', () => {
    const config = buildConfig({
      ...process.env,
      AUTH_RATE_LIMIT: undefined,
    } as NodeJS.ProcessEnv);
    expect(config.AUTH_RATE_LIMIT).toBe(20);
  });
});
