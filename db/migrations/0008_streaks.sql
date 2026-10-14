-- 0008_streaks.sql · Repotra
-- Consistency, shown back to the contributor as a reward rather than a check.
--
-- Deliberate choices, so this encourages rather than punishes:
--   * A day counts when an entry exists for it, submitted or late. Punctuality is not the point;
--     the team is remote and the manager's interest is outcome and consistency.
--   * Today not being logged yet never breaks the run. The streak is "days you showed up",
--     and the day is not over.
--   * Non-working days, holidays and leave are skipped, not broken. Taking Friday off as leave
--     and logging on Monday keeps the run alive.
--
-- security invoker, so row-level security still applies: a contributor can only ever count
-- their own entries, and an admin reading someone else's sees what RLS allows.

create or replace function public.contributor_streak(p_user uuid)
returns table (current_streak int, best_streak int, logged_today boolean, last_logged date)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_today date := local_today(p_user);
  r       record;
  v_run   int := 0;
  v_best  int := 0;
  v_cur   int := 0;
  v_ended boolean := false;   -- the trailing run has been closed by a genuine gap
  v_first boolean := true;
begin
  logged_today := false;
  last_logged  := null;

  for r in
    select d as day,
           exists (
             select 1
               from entries e
              where e.user_id = p_user
                and e.log_type = 'daily'
                and e.period_start = d
                and e.status in ('submitted', 'late')
           ) as logged
      from working_days_between(p_user, v_today - 365, v_today) d
     order by d desc
  loop
    if v_first then
      logged_today := r.logged;
      v_first := false;
    end if;

    if r.logged then
      if last_logged is null then
        last_logged := r.day;
      end if;
      v_run := v_run + 1;
      if not v_ended then
        v_cur := v_cur + 1;
      end if;
    else
      -- Today is still open, so an empty today is a grace day, not a break.
      if r.day <> v_today then
        v_ended := true;
      end if;
      if v_run > v_best then
        v_best := v_run;
      end if;
      v_run := 0;
    end if;
  end loop;

  if v_run > v_best then
    v_best := v_run;
  end if;

  current_streak := v_cur;
  best_streak    := greatest(v_best, v_cur);
  return next;
end;
$$;

comment on function public.contributor_streak(uuid) is
  'Consecutive working days with a daily entry, ending today. Today still being open does not break the run.';

revoke all on function public.contributor_streak(uuid) from public;
grant execute on function public.contributor_streak(uuid) to authenticated;
