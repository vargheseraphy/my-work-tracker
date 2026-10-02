import { z } from 'zod';
import { email, password } from './common.js';

export const loginBody = z.object({
  email,
  password: z.string().min(1).max(200),
});
export type LoginBody = z.infer<typeof loginBody>;

export const acceptInviteBody = z.object({
  token: z.string().min(16).max(200),
  password,
});
export type AcceptInviteBody = z.infer<typeof acceptInviteBody>;

export const forgotBody = z.object({ email });
export type ForgotBody = z.infer<typeof forgotBody>;

export const resetBody = z.object({
  token: z.string().min(16).max(200),
  password,
});
export type ResetBody = z.infer<typeof resetBody>;
