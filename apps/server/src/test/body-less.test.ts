/**
 * A POST with no body at all.
 *
 * Routes such as submit and "mark read" take no input, and a browser sends those with no
 * content-type header. Fastify's default parser rejected them before the handler ran, so the
 * call failed with "Unsupported Media Type" and the UI silently did nothing. Uploads must keep
 * working, so multipart is checked here too.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  closeOwner,
  makeUser,
  resetDatabase,
  signIn,
  startApp,
  uniqueEmail,
  uploadProof,
} from './helpers.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await startApp();
});

afterAll(async () => {
  await app.close();
  await closeOwner();
});

beforeEach(async () => {
  await resetDatabase();
});

describe('a POST carrying no body', () => {
  it('is accepted when it has no content-type at all', async () => {
    const user = await makeUser(uniqueEmail('c'));
    const agent = await signIn(app, user);

    const response = await app.inject({
      method: 'POST',
      url: '/api/notifications/read-all',
      headers: { 'X-Requested-With': 'gtm', cookie: agent.cookie },
    });

    expect(response.statusCode).toBe(200);
  });

  it('still refuses a body of an unrecognised type', async () => {
    const user = await makeUser(uniqueEmail('c'));
    const agent = await signIn(app, user);

    const response = await app.inject({
      method: 'POST',
      url: '/api/notifications/read-all',
      headers: {
        'X-Requested-With': 'gtm',
        cookie: agent.cookie,
        'content-type': 'application/x-made-up',
      },
      payload: 'not json',
    });

    expect(response.statusCode).toBe(415);
  });

  it('leaves multipart uploads working', async () => {
    const user = await makeUser(uniqueEmail('c'));
    const agent = await signIn(app, user);
    const screen = await agent.post('/api/entries/open', {
      type: 'daily',
      period: (await agent.get('/api/home')).json().today,
    });
    const entryId = (screen.json() as { entry: { id: string } }).entry.id;

    expect(await uploadProof(agent, entryId, 'comments')).toBe(201);
  });
});
