/**
 * Password hashing and one-time tokens (docs/SECURITY.md "Passwords", "Sessions").
 *
 * argon2id with the package defaults. Tokens are 32 random bytes in base64url; only the
 * sha256 hex of a token is ever stored, so a stolen database row cannot be replayed.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string | null, plain: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/** A fresh random token. Give the plain value to the person; store only `hashToken(token)`. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time comparison for anything secret. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Spend about as long as a real argon2 verify would, so a request for an address that has no
 * account cannot be told apart from a wrong password by its timing.
 */
export async function wastePasswordTime(): Promise<void> {
  await argon2.hash(randomBytes(16).toString('hex'), { type: argon2.argon2id });
}
