/**
 * db:reset and db:seed destroy or invent data, so they refuse to run against anything but a
 * local database (docs/SECURITY.md "Local only").
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '']);

export function assertLocal(url: string, command: string): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`${command}: DATABASE_URL is not a valid connection string`);
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `${command} refuses to run: the database host is "${host}", not localhost. This command only ever runs locally.`,
    );
  }
}
