-- 0006_accounts_and_notifications.sql
-- Three things the server cannot do through row-level security, so they live in functions the
-- owner owns and only the roles named below may call.
--
-- 1 create_account  : the auth module creates auth.users and public.profiles together. `authenticated`
--                     has no insert on profiles on purpose, and gtm_app inherits that, so inviting
--                     somebody has to go through a function. Callable by gtm_app only.
-- 2 notify_task_assigned : TSK-01 says the assignee is told when a task is created or reassigned.
--                     Nobody may insert into notifications from the browser, so a trigger does it.
-- 3 first_admin_id  : the Monday report job runs as an admin, and has to find one before it has a
--                     user context. Callable by gtm_app only.

-- ---------- 1 create an account (auth module only) ----------
create or replace function public.create_account(
  p_email      text,
  p_full_name  text,
  p_role       public.app_role default 'contributor',
  p_timezone   text default 'Asia/Kolkata',
  p_work_days  smallint[] default null,
  p_start_date date default null
) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare v_id uuid;
begin
  if exists (select 1 from auth.users where email = lower(p_email)) then
    raise exception 'That person already has an account';
  end if;

  insert into auth.users (email) values (lower(p_email)) returning id into v_id;

  insert into public.profiles (id, email, full_name, role, timezone, work_days, start_date)
  values (v_id, lower(p_email), p_full_name, p_role, p_timezone,
          coalesce(p_work_days, '{1,2,3,4,5}'::smallint[]),
          coalesce(p_start_date, current_date));

  return v_id;
end $$;

revoke all on function public.create_account(text, text, public.app_role, text, smallint[], date)
  from public, authenticated;
grant execute on function public.create_account(text, text, public.app_role, text, smallint[], date)
  to gtm_app;

-- ---------- 2 tell the assignee about a new or reassigned task ----------
create or replace function public.notify_task_assigned() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid();
begin
  -- Only on a new task, or when the assignee changes. Not when a task is edited otherwise.
  if tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id then
    return new;
  end if;

  -- No point telling somebody about their own task, or about one that is already finished.
  if new.assignee_id = v_actor or new.status in ('Done', 'Cancelled') then
    return new;
  end if;

  insert into notifications (user_id, rule_key, ref_id, local_date, title, body, link)
  values (new.assignee_id,
          case when tg_op = 'INSERT' then 'task_assigned' else 'task_reassigned' end,
          new.id,
          local_today(new.assignee_id),
          case when tg_op = 'INSERT' then 'A new task is yours' else 'A task was passed to you' end,
          new.title || ' · due ' || to_char(new.due_date, 'Dy DD Mon'),
          '/tasks/' || new.id)
  on conflict do nothing;

  return new;
end $$;

create trigger tasks_notify_assignee
  after insert or update of assignee_id on public.tasks
  for each row execute function public.notify_task_assigned();

-- ---------- 3 the admin the report job runs as ----------
create or replace function public.first_admin_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from profiles where role = 'admin' and active order by created_at limit 1;
$$;

revoke all on function public.first_admin_id() from public, authenticated;
grant execute on function public.first_admin_id() to gtm_app;
