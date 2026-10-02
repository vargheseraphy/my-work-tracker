import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  Agent,
  anonymous,
  closeOwner,
  makeUser,
  owner,
  resetDatabase,
  signIn,
  startApp,
  TEST_PASSWORD,
  type TestUser,
} from '../test/helpers.js';
import { issueToken } from './service.js';

let app: FastifyInstance;
let contributor: TestUser;
let admin: TestUser;

beforeAll(async () => {
  app = await startApp();
});

afterAll(async () => {
  await app.close();
  await closeOwner();
});

beforeEach(async () => {
  await resetDatabase();
  admin = await makeUser('admin@example.test', { role: 'admin', fullName: 'Admin' });
  contributor = await makeUser('tanzil@example.test', { fullName: 'Tanzil' });
});

describe('AUTH-01 · sign in', () => {
  it('signs a person in and sets an httpOnly session cookie', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-requested-with': 'gtm' },
      payload: { email: contributor.email, password: TEST_PASSWORD },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user).toMatchObject({
      email: 'tanzil@example.test',
      fullName: 'Tanzil',
      role: 'contributor',
    });
    expect(response.json().user.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const cookie = String(response.headers['set-cookie']);
    expect(cookie).toContain('gtm_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('never says whether it was the address or the password', async () => {
    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-requested-with': 'gtm' },
      payload: { email: contributor.email, password: 'not-the-password' },
    });
    const noAccount = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-requested-with': 'gtm' },
      payload: { email: 'nobody@example.test', password: TEST_PASSWORD },
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(noAccount.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(noAccount.json());
  });

  it('refuses a password shorter than the minimum without touching the database', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-requested-with': 'gtm' },
      payload: { email: 'not-an-address', password: 'x' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('invalid');
  });
});

describe('AUTH-01 · lockout after ten failures', () => {
  it('locks the account for 15 minutes and keeps refusing the right password', async () => {
    for (let i = 0; i < 10; i += 1) {
      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { 'x-requested-with': 'gtm' },
        payload: { email: contributor.email, password: 'wrong' },
      });
    }

    const client = await owner();
    const row = await client.query<{ locked_until: Date | null; failed_logins: number }>(
      'select locked_until, failed_logins from auth.users where email = $1',
      [contributor.email],
    );
    expect(row.rows[0]!.failed_logins).toBe(10);
    expect(row.rows[0]!.locked_until).not.toBeNull();

    const correct = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-requested-with': 'gtm' },
      payload: { email: contributor.email, password: TEST_PASSWORD },
    });
    expect(correct.statusCode).toBe(401);
    expect(correct.json().message).toContain('locked');
  });

  it('clears the count after a good sign in', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-requested-with': 'gtm' },
      payload: { email: contributor.email, password: 'wrong' },
    });
    await signIn(app, contributor);

    const client = await owner();
    const row = await client.query<{ failed_logins: number }>(
      'select failed_logins from auth.users where email = $1',
      [contributor.email],
    );
    expect(row.rows[0]!.failed_logins).toBe(0);
  });
});

describe('AUTH-04 · an inactive account cannot be used', () => {
  it('refuses to sign in', async () => {
    const client = await owner();
    await client.query('update profiles set active = false where id = $1', [contributor.id]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-requested-with': 'gtm' },
      payload: { email: contributor.email, password: TEST_PASSWORD },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().message).toBe('Ask Raphy for access');
  });

  it('stops an existing session on the next request', async () => {
    const agent = await signIn(app, contributor);
    expect((await agent.get('/api/auth/me')).statusCode).toBe(200);

    const client = await owner();
    await client.query('update profiles set active = false where id = $1', [contributor.id]);

    expect((await agent.get('/api/auth/me')).statusCode).toBe(401);
  });
});

describe('sessions', () => {
  it('returns the signed-in person from /auth/me', async () => {
    const agent = await signIn(app, admin);
    const response = await agent.get('/api/auth/me');
    expect(response.json().user).toMatchObject({ email: admin.email, role: 'admin' });
  });

  it('refuses an anonymous request', async () => {
    const response = await anonymous(app).get('/api/auth/me');
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'signin' });
  });

  it('ends the session on sign out', async () => {
    const agent = await signIn(app, contributor);
    expect((await agent.post('/api/auth/logout')).statusCode).toBe(204);
    expect((await agent.get('/api/auth/me')).statusCode).toBe(401);
  });

  it('rejects a session that has been idle too long', async () => {
    const agent = await signIn(app, contributor);
    const client = await owner();
    await client.query(`update auth.sessions set last_seen_at = now() - interval '13 hours'`);
    expect((await agent.get('/api/auth/me')).statusCode).toBe(401);
  });

  it('rejects a session past its absolute expiry', async () => {
    const agent = await signIn(app, contributor);
    const client = await owner();
    await client.query(`update auth.sessions set expires_at = now() - interval '1 minute'`);
    expect((await agent.get('/api/auth/me')).statusCode).toBe(401);
  });

  it('stores only the hash of the token, never the token itself', async () => {
    const agent = await signIn(app, contributor);
    const token = agent.cookie!.split('=')[1]!;
    const client = await owner();
    const row = await client.query<{ id: string }>('select id from auth.sessions');
    expect(row.rows[0]!.id).not.toBe(token);
    expect(row.rows[0]!.id).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('AUTH-02 · invite only', () => {
  it('sets a password from an invite link and signs the person in', async () => {
    const invited = await makeUser('new@example.test', { fullName: 'New', password: null });
    const invite = await issueToken(invited.id, 'invite');

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/accept-invite',
      headers: { 'x-requested-with': 'gtm' },
      payload: { token: invite.token, password: 'a-good-long-password' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.email).toBe('new@example.test');
    expect(String(response.headers['set-cookie'])).toContain('gtm_session=');
  });

  it('refuses a token that has already been used', async () => {
    const invited = await makeUser('once@example.test', { password: null });
    const invite = await issueToken(invited.id, 'invite');

    const first = await app.inject({
      method: 'POST',
      url: '/api/auth/accept-invite',
      headers: { 'x-requested-with': 'gtm' },
      payload: { token: invite.token, password: 'a-good-long-password' },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/auth/accept-invite',
      headers: { 'x-requested-with': 'gtm' },
      payload: { token: invite.token, password: 'another-long-password' },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(400);
  });

  it('refuses an expired token', async () => {
    const invited = await makeUser('late@example.test', { password: null });
    const invite = await issueToken(invited.id, 'invite');
    const client = await owner();
    await client.query(`update auth.tokens set expires_at = now() - interval '1 hour'`);

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/accept-invite',
      headers: { 'x-requested-with': 'gtm' },
      payload: { token: invite.token, password: 'a-good-long-password' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('refuses a password under 12 characters', async () => {
    const invited = await makeUser('short@example.test', { password: null });
    const invite = await issueToken(invited.id, 'invite');

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/accept-invite',
      headers: { 'x-requested-with': 'gtm' },
      payload: { token: invite.token, password: 'short' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().fields.password).toContain('12');
  });
});

describe('password reset', () => {
  it('returns 204 whether or not the address has an account', async () => {
    const known = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot',
      headers: { 'x-requested-with': 'gtm' },
      payload: { email: contributor.email },
    });
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot',
      headers: { 'x-requested-with': 'gtm' },
      payload: { email: 'nobody@example.test' },
    });
    expect(known.statusCode).toBe(204);
    expect(unknown.statusCode).toBe(204);
  });

  it('changes the password and ends every existing session', async () => {
    const agent = await signIn(app, contributor);
    const reset = await issueToken(contributor.id, 'reset');

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/reset',
      headers: { 'x-requested-with': 'gtm' },
      payload: { token: reset.token, password: 'brand-new-password-1' },
    });
    expect(response.statusCode).toBe(204);
    expect((await agent.get('/api/auth/me')).statusCode).toBe(401);

    const after = await signIn(app, contributor, 'brand-new-password-1');
    expect((await after.get('/api/auth/me')).statusCode).toBe(200);
  });

  it('will not accept an invite token on the reset route', async () => {
    const invite = await issueToken(contributor.id, 'invite');
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/reset',
      headers: { 'x-requested-with': 'gtm' },
      payload: { token: invite.token, password: 'brand-new-password-1' },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('CSRF', () => {
  it('refuses a non-GET request without the X-Requested-With header', async () => {
    const agent = await signIn(app, contributor);
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: agent.cookie! },
    });
    expect(response.statusCode).toBe(403);
  });

  it('refuses a non-GET request from another origin', async () => {
    const agent = await signIn(app, contributor);
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: {
        cookie: agent.cookie!,
        'x-requested-with': 'gtm',
        origin: 'https://evil.example',
      },
    });
    expect(response.statusCode).toBe(403);
  });

  it('allows a GET without the header', async () => {
    const agent = await signIn(app, contributor);
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: agent.cookie! },
    });
    expect(response.statusCode).toBe(200);
  });
});

describe('AUTH-03 · role checks', () => {
  it('keeps a contributor out of the admin routes', async () => {
    const agent = await signIn(app, contributor);
    expect((await agent.get('/api/admin/compliance?month=2026-10')).statusCode).toBe(403);
    expect(
      (await agent.post('/api/admin/unlock', {
        userId: contributor.id,
        type: 'daily',
        period: '2026-10-01',
        reason: 'because',
      })).statusCode,
    ).toBe(403);
  });

  it('lets a viewer read admin pages but change nothing', async () => {
    const viewer = await makeUser('viewer@example.test', { role: 'viewer' });
    const agent = await signIn(app, viewer);
    expect((await agent.get('/api/admin/compliance?month=2026-10')).statusCode).toBe(200);
    expect(
      (await agent.post('/api/tasks', {
        title: 'No',
        assigneeId: contributor.id,
        dueDate: '2026-10-01',
      })).statusCode,
    ).toBe(403);
  });

  it('lets an admin through', async () => {
    const agent = await signIn(app, admin);
    expect((await agent.get('/api/admin/compliance?month=2026-10')).statusCode).toBe(200);
  });
});

describe('security headers', () => {
  it('sends every header docs/SECURITY.md requires', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(response.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(String(response.headers['content-security-policy'])).toContain("frame-ancestors 'none'");
    expect(String(response.headers['permissions-policy'])).toContain('camera=()');
  });
});

/** Keep the Agent class referenced so its type is exercised here too. */
export type { Agent };
