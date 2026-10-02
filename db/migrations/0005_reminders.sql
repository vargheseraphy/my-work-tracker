-- 0005_reminders.sql · works out which reminders are due now, and records them once
-- Called every 15 minutes by the server's scheduler, connected as gtm_app WITHOUT switching to authenticated.
-- A rule fires any time in the 3 hours after its local time, so a laptop that was asleep catches up.
-- The unique key on notifications means each reminder is created once per person, rule, day and subject.

create or replace function public.queue_due_reminders(p_at timestamptz default now())
returns setof public.notifications
language plpgsql security definer set search_path = public as $$
declare
  p profiles; r reminder_rules; t record; a record; adm record;
  v_local timestamp; v_today date; v_prev date; v_prev2 date; v_week date;
  v_rows notifications[] := '{}'; n notifications;
begin
  for p in select * from profiles where active loop
    v_local := p_at at time zone p.timezone;
    v_today := v_local::date;
    v_week := week_monday(v_today);
    select max(d) into v_prev from working_days_between(p.id, v_today - 14, v_today - 1) d;
    select max(d) into v_prev2 from working_days_between(p.id, v_today - 14, v_prev - 1) d;

    for r in select * from reminder_rules
              where active and v_local::time >= local_time and v_local::time < local_time + interval '3 hours'
                and (dow is null or dow = extract(isodow from v_today))
    loop
      n := null;

      if p.role = 'contributor' and is_working_day(p.id, v_today) then
        if r.key = 'daily_not_started' and not exists (
             select 1 from entries e join entry_values ev on ev.entry_id = e.id
              where e.user_id = p.id and e.log_type = 'daily' and e.period_start = v_today) then
          insert into notifications (user_id, rule_key, local_date, title, body, link)
          values (p.id, r.key, v_today, 'Your daily log is not started', 'It is due by 19:00 today.', '/daily')
          on conflict do nothing returning * into n;

        elsif r.key = 'daily_deadline' and not exists (
             select 1 from entries e where e.user_id = p.id and e.log_type = 'daily' and e.period_start = v_today
                and e.status in ('submitted', 'late')) then
          insert into notifications (user_id, rule_key, local_date, title, body, link)
          values (p.id, r.key, v_today, 'Daily log deadline now', 'Submit today''s log. After this it is marked late.', '/daily')
          on conflict do nothing returning * into n;

        elsif r.key in ('day_missed', 'two_days_missed') and v_prev is not null and not exists (
             select 1 from entries e where e.user_id = p.id and e.log_type = 'daily' and e.period_start = v_prev
                and e.status in ('submitted', 'late')) then
          if r.key = 'day_missed' then
            insert into notifications (user_id, rule_key, ref_id, local_date, title, body, link)
            values (p.id, r.key, null, v_today, to_char(v_prev, 'FMDay DD Mon') || ' is missing',
                    'Fill it in first. Today stays locked until it is submitted.', '/daily/' || v_prev)
            on conflict do nothing returning * into n;
          elsif v_prev2 is not null and not exists (
             select 1 from entries e where e.user_id = p.id and e.log_type = 'daily' and e.period_start = v_prev2
                and e.status in ('submitted', 'late')) then
            insert into notifications (user_id, rule_key, local_date, title, body, link)
            values (p.id, r.key, v_today, 'Two working days missing', 'Fill in ' || to_char(v_prev2, 'Dy DD Mon') || ' and ' || to_char(v_prev, 'Dy DD Mon') || '.', '/daily')
            on conflict do nothing returning * into n;
            for adm in select id from profiles where role = 'admin' and active loop
              insert into notifications (user_id, rule_key, ref_id, local_date, title, body, link)
              values (adm.id, r.key, p.id, v_today, p.full_name || ' has missed two working days', 'Last entries missing: ' || to_char(v_prev2, 'Dy DD Mon') || ', ' || to_char(v_prev, 'Dy DD Mon') || '.', '/people/' || p.id)
              on conflict do nothing;
            end loop;
          end if;

        elsif r.key = 'weekly_open' and not exists (
             select 1 from entries e where e.user_id = p.id and e.log_type = 'weekly' and e.period_start = v_week
                and e.status in ('submitted', 'late')) then
          insert into notifications (user_id, rule_key, local_date, title, body, link)
          values (p.id, r.key, v_today, 'Your weekly log is open', 'It is due Monday by 12:00.', '/weekly')
          on conflict do nothing returning * into n;

        elsif r.key = 'weekly_overdue' and not exists (
             select 1 from entries e where e.user_id = p.id and e.log_type = 'weekly' and e.period_start = v_week - 7
                and e.status in ('submitted', 'late')) then
          insert into notifications (user_id, rule_key, local_date, title, body, link)
          values (p.id, r.key, v_today, 'Last week''s log is overdue', 'Submit it now. Raphy has been told.', '/weekly/' || (v_week - 7))
          on conflict do nothing returning * into n;
          for adm in select id from profiles where role = 'admin' and active loop
            insert into notifications (user_id, rule_key, ref_id, local_date, title, body, link)
            values (adm.id, r.key, p.id, v_today, p.full_name || '''s weekly log is overdue', 'Week of ' || to_char(v_week - 7, 'DD Mon') || '.', '/people/' || p.id)
            on conflict do nothing;
          end loop;

        elsif r.key in ('task_due_soon', 'task_due_today', 'task_overdue') then
          for t in select * from tasks where assignee_id = p.id and status not in ('Done', 'Cancelled')
                    and ((r.key = 'task_due_soon' and due_date = v_today + 1)
                      or (r.key = 'task_due_today' and due_date = v_today)
                      or (r.key = 'task_overdue' and due_date < v_today)) loop
            insert into notifications (user_id, rule_key, ref_id, local_date, title, body, link)
            values (p.id, r.key, t.id, v_today,
                    case r.key when 'task_due_soon' then 'Task due tomorrow' when 'task_due_today' then 'Task due today' else 'Task overdue' end,
                    t.title, '/tasks/' || t.id)
            on conflict do nothing returning * into n;
            if n.id is not null then v_rows := v_rows || n; n := null; end if;
            if r.key = 'task_overdue' and (select count(*) from working_days_between(p.id, t.due_date + 1, v_today)) >= 3 then
              for adm in select id from profiles where role = 'admin' and active loop
                insert into notifications (user_id, rule_key, ref_id, local_date, title, body, link)
                values (adm.id, 'task_overdue_admin', t.id, v_today, 'Task overdue 3 days or more', p.full_name || ': ' || t.title, '/admin/tasks')
                on conflict do nothing;
              end loop;
            end if;
          end loop;
        end if;
      end if;

      if p.role = 'admin' then
        if r.key = 'abm_not_planned' and not exists (select 1 from abm_accounts where planned_week = v_week) then
          insert into notifications (user_id, rule_key, local_date, title, body, link)
          values (p.id, r.key, v_today, 'No ABM account planned this week', 'Add one so the one-a-week plan stays on track.', '/abm')
          on conflict do nothing returning * into n;
        elsif r.key = 'abm_not_live' then
          for a in select * from abm_accounts where planned_week = v_week and stage in ('Research', 'Assets ready') loop
            insert into notifications (user_id, rule_key, ref_id, local_date, title, body, link)
            values (p.id, r.key, a.id, v_today, 'This week''s ABM account is not live', a.name || ' is at ' || a.stage || '. Due live by Friday.', '/abm')
            on conflict do nothing returning * into n;
            if n.id is not null then v_rows := v_rows || n; n := null; end if;
            insert into notifications (user_id, rule_key, ref_id, local_date, title, body, link)
            values (a.owner_id, r.key, a.id, v_today, 'Your ABM account is not live yet', a.name || ' is due live by Friday.', '/abm')
            on conflict do nothing;
          end loop;
        elsif r.key = 'monday_summary' then
          insert into notifications (user_id, rule_key, local_date, title, body, link)
          values (p.id, r.key, v_today, 'Your Monday GTM report is ready', 'Week of ' || to_char(v_week - 7, 'DD Mon'), '/report/' || (v_week - 7))
          on conflict do nothing returning * into n;
        end if;
      end if;

      if n.id is not null then v_rows := v_rows || n; end if;
    end loop;
  end loop;

  -- every notification still waiting for email (includes the admin copies inserted above)
  return query select * from notifications where email_status = 'pending' and created_at > p_at - interval '1 day';
end $$;

-- ---------- email queue helpers for the scheduler ----------
create or replace function public.pending_emails()
returns table (id uuid, email text, full_name text, rule_key text, title text, body text, link text, email_on boolean)
language sql stable security definer set search_path = public as $$
  select n.id, p.email, p.full_name, n.rule_key, n.title, n.body, n.link,
         coalesce((select r.email from reminder_rules r where r.key = n.rule_key), true)
    from notifications n join profiles p on p.id = n.user_id
   where n.email_status = 'pending' and p.active and n.created_at > now() - interval '1 day'
   order by n.created_at;
$$;

create or replace function public.mark_email(p_id uuid, p_status text)
returns void language sql security definer set search_path = public as $$
  update notifications set email_status = p_status where id = p_id and p_status in ('sent', 'failed', 'skipped');
$$;

-- only the server's job runner may call these; web requests (role authenticated) may not
revoke all on function public.queue_due_reminders(timestamptz), public.pending_emails(), public.mark_email(uuid, text) from public, authenticated;
grant execute on function public.queue_due_reminders(timestamptz), public.pending_emails(), public.mark_email(uuid, text) to gtm_app;
