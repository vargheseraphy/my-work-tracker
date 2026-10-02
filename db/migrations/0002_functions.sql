-- 0002_functions.sql · helpers, rules, RPCs, triggers, views

-- ---------- access helpers ----------
create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active);
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active and role = 'admin');
$$;

create or replace function public.can_read_all() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active and role in ('admin', 'viewer'));
$$;

create or replace function public.setting(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select value from app_settings where key = p_key;
$$;

-- ---------- dates ----------
create or replace function public.local_now(p_user uuid) returns timestamp
language sql stable security definer set search_path = public as $$
  select now() at time zone (select timezone from profiles where id = p_user);
$$;

create or replace function public.local_today(p_user uuid) returns date
language sql stable as $$ select public.local_now(p_user)::date; $$;

create or replace function public.week_monday(p_day date) returns date
language sql immutable as $$ select p_day - (extract(isodow from p_day)::int - 1); $$;

create or replace function public.is_working_day(p_user uuid, p_day date) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select extract(isodow from p_day)::smallint = any (p.work_days)
       and p_day >= p.start_date
       and not exists (select 1 from calendar_days c
                        where c.day = p_day and (c.user_id is null or c.user_id = p_user))
      from profiles p where p.id = p_user), false);
$$;

create or replace function public.working_days_between(p_user uuid, p_from date, p_to date)
returns setof date language sql stable as $$
  select d::date from generate_series(p_from, p_to, interval '1 day') d
   where public.is_working_day(p_user, d::date);
$$;

-- working days missing a submitted or late daily entry, oldest first
create or replace function public.missing_days(p_user uuid, p_lookback int default 31)
returns setof date language plpgsql stable security definer set search_path = public as $$
declare v_today date := local_today(p_user); v_start date;
begin
  if p_user <> auth.uid() and not can_read_all() then raise exception 'not allowed' using errcode = '42501'; end if;
  select greatest(start_date, v_today - p_lookback) into v_start from profiles where id = p_user;
  return query
    select d from working_days_between(p_user, v_start, v_today - 1) d
     where not exists (select 1 from entries e
                        where e.user_id = p_user and e.log_type = 'daily' and e.period_start = d
                          and e.status in ('submitted', 'late'))
     order by d;
end $$;

-- is a past day still inside the self-service backfill window?
create or replace function public.within_backfill(p_user uuid, p_day date) returns boolean
language sql stable security definer set search_path = public as $$
  select (select count(*) from working_days_between(p_user, p_day, local_today(p_user) - 1))
         <= coalesce((setting('backfill_working_days'))::int, 2);
$$;

-- ---------- open or create an entry (the only way a client creates one) ----------
create or replace function public.open_entry(p_type public.log_type, p_period date)
returns public.entries language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_today date; v_row entries;
begin
  if not is_active_user() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_today := local_today(v_user);
  select * into v_row from entries where user_id = v_user and log_type = p_type and period_start = p_period;
  if found then return v_row; end if;

  if p_type = 'daily' then
    if p_period > v_today then raise exception 'You cannot log a future day'; end if;
    if not is_working_day(v_user, p_period) then raise exception 'That day is not a working day'; end if;
    if p_period < v_today and not within_backfill(v_user, p_period) then
      raise exception 'Too late to backfill. Ask your admin to unlock.';
    end if;
  else
    if extract(isodow from p_period) <> 1 then raise exception 'A weekly log starts on a Monday'; end if;
    if p_period > week_monday(v_today) then raise exception 'You cannot log a future week'; end if;
  end if;

  insert into entries (user_id, log_type, period_start) values (v_user, p_type, p_period) returning * into v_row;
  return v_row;
end $$;

-- ---------- weekly totals from daily entries ----------
create or replace function public.week_auto_totals(p_user uuid, p_week date)
returns table (metric_key text, total numeric)
language sql stable security definer set search_path = public as $$
  select w.key, coalesce(sum(ev.num_value), 0)
    from metric_definitions w
    left join entries e on e.user_id = p_user and e.log_type = 'daily'
                       and e.period_start between p_week and p_week + 6
                       and e.status in ('submitted', 'late')
    left join entry_values ev on ev.entry_id = e.id and ev.metric_key = w.auto_from
   where w.log_type = 'weekly' and w.auto_from is not null and w.active
     and (p_user = auth.uid() or can_read_all())
   group by w.key;
$$;

-- ---------- submit: every sign-off rule lives here ----------
create or replace function public.submit_entry(p_entry uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  e entries; m record; v entry_values; t record;
  errs text[] := '{}';
  v_today date; v_now timestamp; v_avg numeric; v_late boolean; v_due time; v_missing date;
  v_forms numeric;
begin
  select * into e from entries where id = p_entry for update;
  if not found or e.user_id <> v_user or not is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if e.status not in ('draft', 'unlocked') then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('This entry is locked'));
  end if;
  v_today := local_today(v_user);
  v_now := local_now(v_user);

  -- field checks
  for m in
    select md.* from metric_definitions md
      left join user_metric_settings s on s.metric_key = md.key and s.user_id = v_user
     where md.log_type = e.log_type and md.active and coalesce(s.enabled, true) and md.auto_from is null
     order by md.sort_order
  loop
    select * into v from entry_values where entry_id = e.id and metric_key = m.key;

    if m.value_type in ('int', 'percent') then
      if v.num_value is null then errs := errs || (m.label || ': enter a number (0 is fine)'); continue; end if;
      if m.value_type = 'int' and v.num_value <> trunc(v.num_value) then errs := errs || (m.label || ': enter a whole number, 0 or more'); continue; end if;
      if m.value_type = 'percent' and v.num_value > 100 then errs := errs || (m.label || ': enter 0 to 100'); continue; end if;
      if v.num_value > 0 and m.proof = 'file'
         and not exists (select 1 from attachments a where a.entry_id = e.id and a.metric_key = m.key) then
        errs := errs || (m.label || ': attach a screenshot');
      end if;
      if v.num_value > 0 and m.proof = 'link' and coalesce(v.text_value, '') !~ '^https://' then
        errs := errs || (m.label || ': add a link');
      end if;
      if e.log_type = 'daily' then
        select avg(ev.num_value) into v_avg
          from entry_values ev join entries pe on pe.id = ev.entry_id
         where pe.user_id = v_user and pe.log_type = 'daily' and ev.metric_key = m.key
           and pe.status in ('submitted', 'late') and pe.period_start between e.period_start - 28 and e.period_start - 1;
        if v_avg >= coalesce((setting('spike_min_avg'))::numeric, 5)
           and v.num_value > coalesce((setting('spike_multiplier'))::numeric, 3) * v_avg
           and coalesce(btrim(v.note), '') = '' then
          errs := errs || (m.label || ' is much higher than usual. Add a note.');
        end if;
      end if;

    elsif m.value_type = 'text' then
      if m.key = 'wk_form_companies' then
        select num_value into v_forms from entry_values where entry_id = e.id and metric_key = 'wk_forms';
        if coalesce(v_forms, 0) = 0 then continue; end if;
      end if;
      if coalesce(btrim(v.text_value), '') = '' then errs := errs || (m.label || ': required'); end if;
      if length(v.text_value) > 500 then errs := errs || (m.label || ': keep it under 500 characters'); end if;

    elsif m.value_type = 'file' then
      if not exists (select 1 from attachments a where a.entry_id = e.id and a.metric_key = m.key) then
        errs := errs || (m.label || ': upload it');
      end if;

    elsif m.value_type = 'list' and m.key = 'wk_search' then
      if not e.no_search_activity and not exists (select 1 from search_activities sa where sa.entry_id = e.id) then
        errs := errs || 'Search activities: add one, or tick none this week'::text;
      end if;
    end if;
  end loop;

  if e.log_type = 'daily' then
    -- cross-field
    if (select num_value from entry_values where entry_id = e.id and metric_key = 'contacts_filtered')
     > (select num_value from entry_values where entry_id = e.id and metric_key = 'contacts_added') then
      errs := errs || 'Filtered contacts cannot be more than contacts added'::text;
    end if;
    -- due tasks need an update dated on or after this day
    for t in select id, title from tasks
              where assignee_id = v_user and status not in ('Done', 'Cancelled') and due_date <= e.period_start
    loop
      if not exists (select 1 from task_updates tu where tu.task_id = t.id and tu.local_date >= e.period_start) then
        errs := errs || ('Task status: ' || t.title);
      end if;
    end loop;
    -- order and window
    if e.period_start = v_today then
      for v_missing in select d from missing_days(v_user) d where within_backfill(v_user, d) loop
        errs := errs || ('Submit ' || to_char(v_missing, 'Dy DD Mon') || ' first');
      end loop;
    elsif e.status <> 'unlocked' and not within_backfill(v_user, e.period_start) then
      errs := errs || 'Too late to backfill. Ask your admin to unlock.'::text;
    end if;
    v_due := coalesce((setting('daily_due_time') #>> '{}')::time, '19:00');
    v_late := e.is_late or e.period_start < v_today or v_now::time > v_due;

  else
    if v_now < (e.period_start + 4 + coalesce((setting('weekly_open_time') #>> '{}')::time, '16:00')) then
      errs := errs || 'The weekly log opens on Friday at 16:00'::text;
    end if;
    if exists (select 1 from missing_days(v_user) d where d between e.period_start and e.period_start + 4) then
      errs := errs || 'Submit the missing daily logs for this week first'::text;
    end if;
    if exists (select 1 from abm_accounts a where a.owner_id = v_user and a.stage in ('Live', 'Engaged', 'Meeting booked'))
       and not exists (select 1 from entry_abm_accounts x where x.entry_id = e.id) then
      errs := errs || 'ABM: pick at least one account'::text;
    end if;
    v_late := e.is_late or v_now > (e.period_start + 7 + coalesce((setting('weekly_due_time') #>> '{}')::time, '12:00'));
  end if;

  if array_length(errs, 1) > 0 then
    return jsonb_build_object('ok', false, 'errors', to_jsonb(errs));
  end if;

  update entries set
    status = case when v_late then 'late'::entry_status else 'submitted'::entry_status end,
    is_late = v_late,
    submitted_at = now(),
    auto_totals = case when e.log_type = 'weekly'
                       then (select jsonb_object_agg(metric_key, total) from week_auto_totals(v_user, e.period_start))
                       else null end
   where id = e.id;
  return jsonb_build_object('ok', true, 'status', case when v_late then 'late' else 'submitted' end);
end $$;

-- ---------- admin unlock (also opens a missed day that has no entry) ----------
create or replace function public.unlock_entry(p_user uuid, p_type public.log_type, p_period date, p_reason text)
returns public.entries language plpgsql security definer set search_path = public as $$
declare v_row entries;
begin
  if not is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  insert into entries (user_id, log_type, period_start, status, unlocked_by, unlock_reason)
  values (p_user, p_type, p_period, 'unlocked', auth.uid(), p_reason)
  on conflict (user_id, log_type, period_start) do update
     set status = 'unlocked', unlocked_by = auth.uid(), unlock_reason = excluded.unlock_reason
  returning * into v_row;
  insert into notifications (user_id, rule_key, ref_id, local_date, title, body, link)
  values (p_user, 'entry_unlocked', v_row.id, local_today(p_user),
          'Your ' || p_type || ' log for ' || to_char(p_period, 'Dy DD Mon') || ' was unlocked',
          'Reason: ' || p_reason, '/' || p_type || '/' || p_period)
  on conflict do nothing;
  return v_row;
end $$;

-- ---------- task status update (assignee or admin) ----------
create or replace function public.update_task(p_task uuid, p_status public.task_status, p_note text, p_proof_url text default null)
returns public.tasks language plpgsql security definer set search_path = public as $$
declare t tasks;
begin
  select * into t from tasks where id = p_task for update;
  if not found or not is_active_user() or (t.assignee_id <> auth.uid() and not is_admin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_status = 'Cancelled' and not is_admin() then raise exception 'Only an admin can cancel a task'; end if;
  if p_status = 'Blocked' and coalesce(btrim(p_note), '') = '' then raise exception 'Say what is blocking you'; end if;
  if p_status = 'Done' and coalesce(btrim(p_proof_url), '') = ''
     and not exists (select 1 from attachments a where a.task_id = p_task) then
    raise exception 'Add a link or attach a file before marking this Done';
  end if;
  insert into task_updates (task_id, user_id, status, note, proof_url, local_date)
  values (p_task, auth.uid(), p_status, p_note, p_proof_url, local_today(t.assignee_id));
  update tasks set status = p_status, status_note = p_note,
                   proof_url = coalesce(p_proof_url, proof_url),
                   completed_at = case when p_status = 'Done' then now() else null end
   where id = p_task returning * into t;
  return t;
end $$;

-- ---------- dashboard: compliance grid for a month ----------
create or replace function public.dashboard_compliance(p_month date)
returns table (user_id uuid, full_name text, day date, status text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, d::date,
    case
      when exists (select 1 from calendar_days c where c.day = d::date and c.user_id = p.id) then 'leave'
      when exists (select 1 from calendar_days c where c.day = d::date and c.user_id is null) then 'holiday'
      when not (extract(isodow from d)::smallint = any (p.work_days)) or d::date < p.start_date then 'off'
      when e.status = 'submitted' then 'submitted'
      when e.status = 'late' then 'late'
      when d::date < local_today(p.id) then 'missing'
      when d::date = local_today(p.id) then 'due'
      else 'future'
    end
  from profiles p
  cross join generate_series(date_trunc('month', p_month), date_trunc('month', p_month) + interval '1 month - 1 day', interval '1 day') d
  left join entries e on e.user_id = p.id and e.log_type = 'daily' and e.period_start = d::date
  where p.active and p.role = 'contributor' and can_read_all()
  order by p.full_name, d;
$$;

-- ---------- dashboard: this week against target ----------
create or replace function public.dashboard_week(p_week date)
returns table (user_id uuid, metric_key text, actual numeric, target int)
language sql stable security definer set search_path = public as $$
  with daily as (
    select e.user_id, ev.metric_key, sum(ev.num_value) as total
      from entries e join entry_values ev on ev.entry_id = e.id
     where e.log_type = 'daily' and e.status in ('submitted', 'late')
       and e.period_start between p_week and p_week + 6
     group by 1, 2),
  weekly as (
    select e.user_id, ev.metric_key, ev.num_value as total
      from entries e join entry_values ev on ev.entry_id = e.id
     where e.log_type = 'weekly' and e.period_start = p_week and e.status in ('submitted', 'late'))
  select p.id, md.key, coalesce(dl.total, wk.total, 0), s.weekly_target
    from profiles p
    cross join metric_definitions md
    left join user_metric_settings s on s.user_id = p.id and s.metric_key = md.key
    left join daily dl on dl.user_id = p.id and dl.metric_key = md.key
    left join weekly wk on wk.user_id = p.id and wk.metric_key = md.key
   where md.is_target_measure and p.active and p.role = 'contributor'
     and (p.id = auth.uid() or can_read_all());
$$;

-- ---------- views (run with the caller's rights, so RLS applies) ----------
create view public.v_open_tasks with (security_invoker = true) as
  select t.*, (t.due_date < public.local_today(t.assignee_id)) as is_overdue,
         (t.due_date = public.local_today(t.assignee_id)) as is_due_today
    from public.tasks t where t.status not in ('Done', 'Cancelled');

create view public.v_week_totals with (security_invoker = true) as
  select e.user_id, public.week_monday(e.period_start) as week_start, ev.metric_key, sum(ev.num_value) as total
    from public.entries e join public.entry_values ev on ev.entry_id = e.id
   where e.log_type = 'daily' and e.status in ('submitted', 'late')
   group by 1, 2, 3;

create view public.v_abm_week_plan with (security_invoker = true) as
  select a.planned_week, a.id as account_id, a.name, a.owner_id, a.stage,
         a.stage in ('Live', 'Engaged', 'Meeting booked', 'Closed') as is_live
    from public.abm_accounts a;

-- ---------- triggers ----------
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

do $$ declare t text; begin
  foreach t in array array['profiles','entries','entry_values','tasks','abm_accounts','abm_weekly_touches','app_settings'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
  end loop; end $$;

-- values can only change while the parent entry is editable
create or replace function public.guard_entry_children() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_status entry_status;
begin
  select status into v_status from entries where id = coalesce(new.entry_id, old.entry_id);
  if v_status in ('submitted', 'late') then raise exception 'This entry is locked'; end if;
  return coalesce(new, old);
end $$;
create trigger entry_values_guard before insert or update or delete on public.entry_values
  for each row execute function public.guard_entry_children();
create trigger search_activities_guard before insert or update or delete on public.search_activities
  for each row execute function public.guard_entry_children();
create trigger entry_abm_guard before insert or update or delete on public.entry_abm_accounts
  for each row execute function public.guard_entry_children();

-- non-admin ABM owners can only change working fields
create or replace function public.guard_abm_owner_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() and (new.name, new.vertical, new.region, new.owner_id, new.planned_week, new.created_by)
                     is distinct from (old.name, old.vertical, old.region, old.owner_id, old.planned_week, old.created_by) then
    raise exception 'Only an admin can change the account, owner or launch week';
  end if;
  if new.stage in ('Live', 'Engaged', 'Meeting booked') and old.live_at is null then new.live_at := now(); end if;
  return new;
end $$;
create trigger abm_owner_guard before update on public.abm_accounts
  for each row execute function public.guard_abm_owner_update();

-- audit trail
create or replace function public.audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_row jsonb := to_jsonb(coalesce(new, old));
begin
  insert into audit_log (table_name, row_id, action, actor_id, old_data, new_data)
  values (tg_table_name,
          coalesce(v_row ->> 'id', v_row ->> 'entry_id', v_row ->> 'user_id', ''),
          tg_op, auth.uid(),
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
do $$ declare t text; begin
  foreach t in array array['profiles','entries','entry_values','tasks','abm_accounts','calendar_days','user_metric_settings','app_settings','reminder_rules'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit()', t || '_audit', t);
  end loop; end $$;
