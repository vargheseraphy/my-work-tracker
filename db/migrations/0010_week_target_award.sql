-- 0010_week_target_award.sql · Repotra
-- Hitting every weekly target is worth saying out loud, to the person and to their manager.
--
-- This rides on the existing notifications table rather than adding one: its unique key
-- (user_id, rule_key, local_date, ref_id) already guarantees an award is made once per person
-- per week, which is exactly the "celebrate once, never nag" behaviour wanted here.
--
-- The contributor's own row is what the home screen turns into a congratulations message.
-- The admins' rows are the real notification the message promises; the app must never claim
-- the manager was told unless a row was actually written.

-- Has this person met every weekly target that is set and enabled for them?
-- Someone with no targets set has not "achieved" anything, so they are excluded.
--
-- Call these with app.user_id set, which withUser() always does. They read through
-- dashboard_week(), which is scoped to auth.uid() or can_read_all(); with no user in scope it
-- returns no rows, and the award would silently never fire.
create or replace function public.week_target_met(p_user uuid, p_week date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1 from dashboard_week(p_week) w
            join user_metric_settings s
              on s.user_id = w.user_id and s.metric_key = w.metric_key and s.enabled
           where w.user_id = p_user and w.target is not null and w.target > 0
         )
     and not exists (
           select 1 from dashboard_week(p_week) w
            join user_metric_settings s
              on s.user_id = w.user_id and s.metric_key = w.metric_key and s.enabled
           where w.user_id = p_user and w.target is not null and w.target > 0
             and w.actual < w.target
         );
$$;

comment on function public.week_target_met(uuid, date) is
  'True when every enabled weekly target with a value above zero has been reached for that week.';

-- Award it, once. Returns true only on the run that actually created the notifications, so the
-- caller can use that to decide whether to celebrate on screen.
create or replace function public.award_week_target(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week   date := week_monday(local_today(p_user));
  v_name   text;
  v_made   boolean := false;
begin
  if not week_target_met(p_user, v_week) then
    return false;
  end if;

  select full_name into v_name from profiles where id = p_user;

  -- The contributor's own copy. The insert is the award; a conflict means it already happened.
  insert into notifications (user_id, rule_key, local_date, title, body, link)
  values (
    p_user,
    'week_target_met',
    v_week,
    'Every target hit this week',
    'You have reached every target set for you this week. Your manager has been told.',
    '/'
  )
  on conflict do nothing;

  get diagnostics v_made = row_count;

  if not v_made then
    return false;   -- already awarded this week, so do not notify the admins again either
  end if;

  -- The promise in that message, made real.
  insert into notifications (user_id, rule_key, ref_id, local_date, title, body, link)
  select a.id,
         'week_target_met',
         p_user,
         v_week,
         coalesce(v_name, 'A contributor') || ' hit every target',
         coalesce(v_name, 'A contributor') || ' reached every weekly target for the week of '
           || to_char(v_week, 'DD Mon') || '.',
         '/admin/people/' || p_user::text
    from profiles a
   where a.role = 'admin' and a.active and a.id <> p_user
  on conflict do nothing;

  return true;
end;
$$;

comment on function public.award_week_target(uuid) is
  'Notifies the contributor and every active admin, once per person per week. True only on the run that awarded it.';

revoke all on function public.week_target_met(uuid, date) from public;
revoke all on function public.award_week_target(uuid) from public;
grant execute on function public.week_target_met(uuid, date) to authenticated;
grant execute on function public.award_week_target(uuid) to authenticated;
