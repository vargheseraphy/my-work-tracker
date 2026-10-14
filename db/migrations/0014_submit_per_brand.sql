-- 0014_submit_per_brand.sql · Repotra
-- submit_entry now expects one answer per brand for the channel measures (db/migrations/0013).
--
-- The shape of the check is unchanged; it simply runs once per brand instead of once per metric.
-- Three things had to follow the brand with it, and each would have been a quiet bug:
--   * error messages name the brand, or three identical "enter a number" lines appear
--   * the spike average compares like with like, or splitting one number across three brands
--     reads as a sudden drop and then a spike
--   * "which companies?" follows the form count of its own brand
--
-- Someone with no brands assigned still gets exactly one row to fill in, so turning this on
-- does not lock anybody out before an admin has assigned them.

CREATE OR REPLACE FUNCTION public.submit_entry(p_entry uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  e entries; m record; v entry_values; t record; b record;
  errs text[] := '{}';
  v_today date; v_now timestamp; v_avg numeric; v_late boolean; v_due time; v_missing date;
  v_forms numeric;
  v_label text;
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
    -- Which accounts this measure is answered for. A per-brand measure is answered once for
    -- each brand the person is assigned; everything else keeps a single row with brand_id null.
    -- Someone with no brands assigned yet still gets one row, so they are never blocked.
    for b in
      select ub.brand_id as brand_id, br.name as brand_name
        from user_brands ub
        join brands br on br.id = ub.brand_id
       where m.per_brand and ub.user_id = v_user and br.active
      union all
      select null::uuid, null::text
       where not m.per_brand
          or not exists (
               select 1 from user_brands ub2
                 join brands br2 on br2.id = ub2.brand_id
                where ub2.user_id = v_user and br2.active)
       order by 2 nulls first
    loop
    select * into v from entry_values
     where entry_id = e.id and metric_key = m.key and brand_id is not distinct from b.brand_id;

    -- Errors name the brand, so a person running three accounts can tell them apart.
    v_label := m.label || coalesce(' (' || b.brand_name || ')', '');

    if m.value_type in ('int', 'percent') then
      if v.num_value is null then errs := errs || (v_label || ': enter a number (0 is fine)'); continue; end if;
      if m.value_type = 'int' and v.num_value <> trunc(v.num_value) then errs := errs || (v_label || ': enter a whole number, 0 or more'); continue; end if;
      if m.value_type = 'percent' and v.num_value > 100 then errs := errs || (v_label || ': enter 0 to 100'); continue; end if;
      if v.num_value > 0 and m.proof = 'file'
         and not exists (select 1 from attachments a where a.entry_id = e.id and a.metric_key = m.key) then
        errs := errs || (v_label || ': attach a screenshot');
      end if;
      if v.num_value > 0 and m.proof = 'link' and coalesce(v.text_value, '') !~ '^https://' then
        errs := errs || (v_label || ': add a link');
      end if;
      if e.log_type = 'daily' then
        select avg(ev.num_value) into v_avg
          from entry_values ev join entries pe on pe.id = ev.entry_id
         where pe.user_id = v_user and pe.log_type = 'daily' and ev.metric_key = m.key
           and ev.brand_id is not distinct from b.brand_id
           and pe.status in ('submitted', 'late') and pe.period_start between e.period_start - 28 and e.period_start - 1;
        if v_avg >= coalesce((setting('spike_min_avg'))::numeric, 5)
           and v.num_value > coalesce((setting('spike_multiplier'))::numeric, 3) * v_avg
           and coalesce(btrim(v.note), '') = '' then
          errs := errs || (v_label || ' is much higher than usual. Add a note.');
        end if;
      end if;

    elsif m.value_type = 'text' then
      if m.key = 'wk_form_companies' then
        select num_value into v_forms from entry_values
         where entry_id = e.id and metric_key = 'wk_forms'
           and brand_id is not distinct from b.brand_id;
        if coalesce(v_forms, 0) = 0 then continue; end if;
      end if;
      if coalesce(btrim(v.text_value), '') = '' then errs := errs || (v_label || ': required'); end if;
      if length(v.text_value) > 500 then errs := errs || (v_label || ': keep it under 500 characters'); end if;

    elsif m.value_type = 'file' then
      if not exists (select 1 from attachments a where a.entry_id = e.id and a.metric_key = m.key) then
        errs := errs || (v_label || ': upload it');
      end if;

    elsif m.value_type = 'list' and m.key = 'wk_search' then
      if not e.no_search_activity and not exists (select 1 from search_activities sa where sa.entry_id = e.id) then
        errs := errs || 'Search activities: add one, or tick none this week'::text;
      end if;
    end if;
    end loop;
  end loop;

  if e.log_type = 'daily' then
    -- cross-field
    if (select num_value from entry_values
         where entry_id = e.id and metric_key = 'contacts_filtered' and brand_id is null)
     > (select num_value from entry_values
         where entry_id = e.id and metric_key = 'contacts_added' and brand_id is null) then
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
    -- DAY-07 was here. A missing earlier day used to block today; it is now a nudge shown on
    -- the home screen instead (db/migrations/0009). Backfilling stays bounded by the window.
    if e.period_start <> v_today
       and e.status <> 'unlocked' and not within_backfill(v_user, e.period_start) then
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
end $function$


