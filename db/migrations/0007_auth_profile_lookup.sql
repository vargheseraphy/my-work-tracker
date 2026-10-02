-- 0007_auth_profile_lookup.sql
-- The auth module runs as gtm_app with no user set, so every row-level security policy on
-- profiles (which all start with is_active_user()) hides every row from it. Signing in and
-- reading a session both need the profile before there is a user context to check, which is a
-- chicken-and-egg problem that only a function the owner owns can solve.
--
-- auth_profile returns exactly the columns the auth module needs, for one person, and only
-- gtm_app may call it. It is not a way round row-level security for anything else: it takes an
-- id, returns no list, and is unreachable from a web request.

create or replace function public.auth_profile(p_id uuid)
returns table (
  id        uuid,
  email     text,
  full_name text,
  role      public.app_role,
  timezone  text,
  active    boolean
)
language sql stable security definer set search_path = public as $$
  select p.id, p.email, p.full_name, p.role, p.timezone, p.active
    from profiles p where p.id = p_id;
$$;

revoke all on function public.auth_profile(uuid) from public, authenticated;
grant execute on function public.auth_profile(uuid) to gtm_app;
