-- 0000_roles_and_auth.sql · Yallo GTM Tracker
-- Plain PostgreSQL 16. Runs the same on a local install and on Neon.
-- Run every migration as the database OWNER role (locally: postgres; on Neon: neondb_owner).

-- ---------- roles ----------
-- authenticated : the role every signed-in web request runs as (SET LOCAL ROLE authenticated).
--                 Row-level security policies are written for this role.
-- gtm_app       : the login role the server connects with. It is a member of authenticated,
--                 can use the auth schema, and can run the job functions. It owns nothing.
--                 Its password is set by scripts/db-setup (never in a migration).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'gtm_app') then
    create role gtm_app nologin;
  end if;
end $$;
grant authenticated to gtm_app;

-- ---------- auth schema: credentials and sessions, never visible to web requests ----------
create schema if not exists auth;

create table auth.users (
  id               uuid primary key default gen_random_uuid(),
  email            text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  password_hash    text,                                  -- argon2id; null until the invite is accepted
  failed_logins    int not null default 0,
  locked_until     timestamptz,
  last_sign_in_at  timestamptz,
  created_at       timestamptz not null default now()
);
create unique index auth_users_email_idx on auth.users (email);

create table auth.sessions (
  id            text primary key,                         -- sha256 hex of the random session token; the token itself is only in the cookie
  user_id       uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null,
  user_agent    text,
  ip            text
);
create index auth_sessions_user_idx on auth.sessions (user_id);

create table auth.tokens (
  token_hash  text primary key,                           -- sha256 hex of a one-time token sent by email
  user_id     uuid not null references auth.users (id) on delete cascade,
  purpose     text not null check (purpose in ('invite', 'reset')),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- the signed-in user for this transaction, set by the server:
--   select set_config('app.user_id', $1, true);  set local role authenticated;
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid;
$$;

revoke all on schema auth from public;
grant usage on schema auth to authenticated, gtm_app;
revoke all on all tables in schema auth from public, authenticated;
grant execute on function auth.uid() to authenticated, gtm_app;
grant select, insert, update, delete on auth.users, auth.sessions, auth.tokens to gtm_app;
