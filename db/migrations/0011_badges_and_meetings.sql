-- 0011_badges_and_meetings.sql · Repotra
-- Badges, and the celebration when a meeting is booked.
--
-- Badges are derived, never stored. A stored badge can disagree with the data behind it, and a
-- badge that is wrong is worse than no badge at all. These are computed on read, so they are
-- always true and nothing has to be backfilled or repaired.
--
-- Tiers climb: the first is reachable within days, the last takes months. Nothing is ever lost,
-- because every badge is measured on a lifetime total or a personal best, never on a current run.

-- One row per badge, with the value behind it and the next tier to aim at.
create or replace function public.contributor_badges(p_user uuid)
returns table (
  key           text,
  label         text,
  description   text,
  value         int,
  tier          int,          -- how many thresholds have been passed, 0 means not started
  tiers         int[],
  next_threshold int
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_best      int;
  v_weeks     int;
  v_meetings  int;
  v_replies   int;
begin
  select best_streak into v_best from contributor_streak(p_user);

  -- Weeks where every target was met. The award notification is the record of it.
  select count(*)::int into v_weeks
    from notifications n
   where n.user_id = p_user and n.rule_key = 'week_target_met';

  select coalesce(sum(ev.num_value), 0)::int into v_meetings
    from entries e
    join entry_values ev on ev.entry_id = e.id
   where e.user_id = p_user and e.log_type = 'weekly'
     and e.status in ('submitted', 'late') and ev.metric_key = 'wk_meetings';

  select coalesce(sum(ev.num_value), 0)::int into v_replies
    from entries e
    join entry_values ev on ev.entry_id = e.id
   where e.user_id = p_user and e.log_type = 'daily'
     and e.status in ('submitted', 'late') and ev.metric_key = 'replies';

  return query
  with raw(key, label, description, value, tiers) as (
    values
      ('consistency', 'Consistency', 'Your longest run of working days logged',
       v_best, array[3, 5, 10, 20, 40, 60, 100]),
      ('on_target',   'On target',   'Weeks where you reached every target set for you',
       v_weeks, array[1, 3, 6, 12, 26]),
      ('meetings',    'Meetings booked', 'Meetings booked and logged, all time',
       v_meetings, array[1, 5, 10, 25, 50]),
      ('replies',     'Replies earned',  'Replies received from your outreach, all time',
       v_replies, array[10, 50, 150, 400, 1000])
  )
  select r.key, r.label, r.description, r.value,
         (select count(*)::int from unnest(r.tiers) t where r.value >= t) as tier,
         r.tiers,
         (select min(t) from unnest(r.tiers) t where t > r.value) as next_threshold
    from raw r;
end;
$$;

comment on function public.contributor_badges(uuid) is
  'Derived badges with the value behind each. Nothing is stored, so a badge can never be stale.';

-- A booked meeting is the outcome the whole tracker exists for, so it gets its own moment.
-- Once per week, keyed on the week, and only to the person: meetings are frequent enough that
-- notifying every admin each time would become noise, and the dashboard already shows them.
create or replace function public.award_meetings(p_entry uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  e        record;
  v_count  int;
  v_made   boolean := false;
begin
  select id, user_id, log_type, period_start, status into e from entries where id = p_entry;
  if not found or e.log_type <> 'weekly' or e.status not in ('submitted', 'late') then
    return false;
  end if;

  select coalesce(num_value, 0)::int into v_count
    from entry_values where entry_id = e.id and metric_key = 'wk_meetings';

  if coalesce(v_count, 0) < 1 then
    return false;
  end if;

  insert into notifications (user_id, rule_key, ref_id, local_date, title, body, link)
  values (
    e.user_id,
    'meeting_booked',
    e.id,
    e.period_start,
    case when v_count = 1 then 'A meeting booked' else v_count || ' meetings booked' end,
    case when v_count = 1
      then 'That is the outcome all the activity is for. Well done.'
      else 'That is the outcome all the activity is for. Well done.'
    end,
    '/weekly'
  )
  on conflict do nothing;

  get diagnostics v_made = row_count;
  return v_made;
end;
$$;

comment on function public.award_meetings(uuid) is
  'Celebrates meetings booked on a submitted weekly log, once per week.';

revoke all on function public.contributor_badges(uuid) from public;
revoke all on function public.award_meetings(uuid) from public;
grant execute on function public.contributor_badges(uuid) to authenticated;
grant execute on function public.award_meetings(uuid) to authenticated;
