/**
 * The one way the web app talks to the server. Every request carries the session cookie and the
 * `X-Requested-With: gtm` header the CSRF check wants (docs/SECURITY.md).
 */

import type { ApiError } from '@gtm/shared';

export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError,
  ) {
    super(body.message ?? body.error);
    this.name = 'ApiProblem';
  }

  /** The first field message, for a form. */
  get firstField(): string | undefined {
    return this.body.fields ? Object.values(this.body.fields)[0] : undefined;
  }

  /** What to show someone, in plain words. */
  get text(): string {
    if (this.body.message) return this.body.message;
    if (this.firstField) return this.firstField;
    switch (this.body.error) {
      case 'signin':
        return 'Please sign in again';
      case 'forbidden':
        return 'You cannot do that';
      case 'not_found':
        return 'That is not here';
      case 'too_many':
        return 'Too many attempts. Try again in a few minutes.';
      case 'invalid':
        return 'Check what you entered';
      default:
        return 'Something went wrong. Try again.';
    }
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Called when any request comes back 401, so the app can send the person to sign in. */
let onSignedOut: (() => void) | undefined;
export function setSignedOutHandler(handler: () => void): void {
  onSignedOut = handler;
}

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      'X-Requested-With': 'gtm',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : undefined;

  if (!response.ok) {
    const problem = new ApiProblem(response.status, (payload ?? { error: 'server' }) as ApiError);
    if (response.status === 401 && path !== '/auth/me') onSignedOut?.();
    throw problem;
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),

  /** Multipart upload, for proof files. */
  async upload<T>(path: string, form: FormData): Promise<T> {
    const response = await fetch(`/api${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'gtm' },
      body: form,
    });
    const text = await response.text();
    const payload = text ? (JSON.parse(text) as unknown) : undefined;
    if (!response.ok) {
      if (response.status === 401) onSignedOut?.();
      throw new ApiProblem(response.status, (payload ?? { error: 'server' }) as ApiError);
    }
    return payload as T;
  },
};
