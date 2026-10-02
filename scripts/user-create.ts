/**
 * Create an invited account and print its set-password link. The first admin is made this way.
 *
 *   npm run user:create -- --email someone@yallo.co --name "Full Name" --role admin
 *   npm run user:create -- --email someone@yallo.co --name "Full Name" --timezone Asia/Dubai
 */

import { loadDotEnv } from '../apps/server/src/config.js';
import { createUser, issueToken } from '../apps/server/src/auth/service.js';
import { invitePasswordEmail } from '../apps/server/src/mail/templates.js';
import { sendMail } from '../apps/server/src/mail/transport.js';
import { closePool } from '../apps/server/src/db.js';

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  loadDotEnv();

  const email = flag('email');
  const name = flag('name');
  const role = (flag('role') ?? 'contributor') as 'admin' | 'contributor' | 'viewer';
  const timezone = flag('timezone') ?? 'Asia/Kolkata';

  if (!email || !name) {
    console.error(
      'Usage: npm run user:create -- --email someone@yallo.co --name "Full Name" [--role admin] [--timezone Asia/Dubai]',
    );
    process.exit(1);
  }
  if (!['admin', 'contributor', 'viewer'].includes(role)) {
    console.error('--role must be admin, contributor or viewer');
    process.exit(1);
  }

  const user = await createUser({ email: email.toLowerCase(), fullName: name, role, timezone });
  const invite = await issueToken(user.id, 'invite');

  console.log(`\nCreated ${name} <${email}> as ${role}.`);
  console.log(`Set-password link (valid ${process.env.INVITE_TOKEN_HOURS ?? 48} hours):\n`);
  console.log(`  ${invite.link}\n`);

  try {
    await sendMail(invitePasswordEmail(email.toLowerCase(), name, invite.link));
    console.log('The invite email was sent. Locally it is waiting at http://localhost:8025\n');
  } catch (error) {
    console.log(`The invite email could not be sent (${(error as Error).message}).`);
    console.log('Send the link above by hand.\n');
  }

  await closePool();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: Error) => {
    console.error(error.message);
    process.exit(1);
  });
}
