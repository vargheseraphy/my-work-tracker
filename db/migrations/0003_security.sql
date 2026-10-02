-- 0003_security.sql · row-level security and grants
-- RLS is enabled but not forced: the owner role (migrations) and the SECURITY DEFINER functions it owns
-- bypass it on purpose, which is how rules run safely on Neon too (the owner is not a superuser there).

-- ---------- turn RLS on everywhere ----------
do $$ declare t text; begin
  foreach t in array array['profiles','app_settings','metric_definitions','user_metric_settings','entries','entry_values',
    'tasks','task_updates','attachments','abm_accounts','abm_weekly_touches','search_activities','entry_abm_accounts',
    'calendar_days','reminder_rules','notifications','audit_log'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop; end $$;

-- ---------- default deny, then grant only what is needed ----------
revoke all on all tables in schema public from public, authenticated, gtm_app;
revoke all on all functions in schema public from public;
grant usage on schema public to authenticated, gtm_app;
alter default privileges in schema public revoke all on tables from public;
alter default privileges in schema public revoke execute on functions from public;

grant select on all tables in schema public to authenticated;           -- rows still filtered by RLS; audit_log is admin-only below

grant insert, update, delete on public.entry_values, public.search_activities, public.entry_abm_accounts,
  public.attachments, public.abm_weekly_touches to authenticated;
grant update (no_search_activity) on public.entries to authenticated;  -- status only changes through functions
grant update (read_at) on public.notifications to authenticated;
grant update (stage, notes, research_url, deck_url, landing_url) on public.abm_accounts to authenticated;
grant insert, delete, update on public.tasks, public.calendar_days, public.user_metric_settings,
  public.app_settings, public.reminder_rules, public.metric_definitions to authenticated;   -- admin-only policies below
grant insert, delete on public.abm_accounts to authenticated;
grant update (name, vertical, region, owner_id, planned_week) on public.abm_accounts to authenticated;
grant update (full_name, role, timezone, work_days, start_date, active) on public.profiles to authenticated;

grant execute on function public.open_entry(public.log_type, date), public.submit_entry(uuid),
  public.unlock_entry(uuid, public.log_type, date, text), public.update_task(uuid, public.task_status, text, text),
  public.missing_days(uuid, int), public.week_auto_totals(uuid, date), public.dashboard_compliance(date),
  public.dashboard_week(date), public.local_today(uuid), public.is_working_day(uuid, date),
  public.is_admin(), public.can_read_all(), public.is_active_user(), public.within_backfill(uuid, date),
  public.working_days_between(uuid, date, date), public.local_now(uuid), public.week_monday(date), public.setting(text)
  to authenticated;

-- ---------- policies ----------
-- profiles: teammates' names are visible to the team; only admins edit
create policy profiles_read on public.profiles for select to authenticated using (public.is_active_user());
create policy profiles_admin_update on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- reference data: everyone reads, admins write
create policy app_settings_read on public.app_settings for select to authenticated using (public.is_active_user());
create policy app_settings_admin on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy metrics_read on public.metric_definitions for select to authenticated using (public.is_active_user());
create policy metrics_admin on public.metric_definitions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy rules_read on public.reminder_rules for select to authenticated using (public.is_active_user());
create policy rules_admin on public.reminder_rules for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy calendar_read on public.calendar_days for select to authenticated using (public.is_active_user());
create policy calendar_admin on public.calendar_days for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- per-person settings
create policy ums_read on public.user_metric_settings for select to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.can_read_all()));
create policy ums_admin on public.user_metric_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- entries: own rows, or everything for admin and viewer
create policy entries_read on public.entries for select to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.can_read_all()));
create policy entries_own_update on public.entries for update to authenticated
  using (user_id = auth.uid() and status in ('draft', 'unlocked') and public.is_active_user())
  with check (user_id = auth.uid() and status in ('draft', 'unlocked'));

-- children of an entry: readable with the entry, writable only by the owner while editable
create or replace function public.entry_editable(p_entry uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from entries e where e.id = p_entry and e.user_id = auth.uid()
                  and e.status in ('draft', 'unlocked')) and is_active_user();
$$;
create or replace function public.entry_visible(p_entry uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from entries e where e.id = p_entry and (e.user_id = auth.uid() or can_read_all())) and is_active_user();
$$;
grant execute on function public.entry_editable(uuid), public.entry_visible(uuid) to authenticated;

do $$ declare t text; begin
  foreach t in array array['entry_values','search_activities','entry_abm_accounts'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.entry_visible(entry_id))', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.entry_editable(entry_id))', t || '_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.entry_editable(entry_id)) with check (public.entry_editable(entry_id))', t || '_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.entry_editable(entry_id))', t || '_del', t);
  end loop; end $$;

-- attachments: the uploader owns the row; entry files follow the entry, task files follow the task
create policy attachments_read on public.attachments for select to authenticated using (
  public.is_active_user() and (owner_id = auth.uid() or public.can_read_all()));
create policy attachments_ins on public.attachments for insert to authenticated with check (
  owner_id = auth.uid() and split_part(storage_path, '/', 1) = auth.uid()::text and (
    (entry_id is not null and public.entry_editable(entry_id)) or
    (task_id is not null and exists (select 1 from public.tasks t where t.id = task_id and t.assignee_id = auth.uid()))));
create policy attachments_del on public.attachments for delete to authenticated using (
  owner_id = auth.uid() and (entry_id is null or public.entry_editable(entry_id)));

-- tasks: assignee reads own, admin does everything; status changes go through update_task()
create policy tasks_read on public.tasks for select to authenticated
  using (public.is_active_user() and (assignee_id = auth.uid() or public.can_read_all()));
create policy tasks_admin on public.tasks for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy task_updates_read on public.task_updates for select to authenticated using (
  exists (select 1 from public.tasks t where t.id = task_id and (t.assignee_id = auth.uid() or public.can_read_all())) and public.is_active_user());

-- ABM: the team reads all accounts; admin adds and removes; owner or admin updates
create policy abm_read on public.abm_accounts for select to authenticated using (public.is_active_user());
create policy abm_admin_ins on public.abm_accounts for insert to authenticated with check (public.is_admin());
create policy abm_admin_del on public.abm_accounts for delete to authenticated using (public.is_admin());
create policy abm_update on public.abm_accounts for update to authenticated
  using (public.is_admin() or (owner_id = auth.uid() and public.is_active_user()))
  with check (public.is_admin() or owner_id = auth.uid());
create policy touches_read on public.abm_weekly_touches for select to authenticated using (public.is_active_user());
create policy touches_write on public.abm_weekly_touches for all to authenticated
  using (public.is_admin() or exists (select 1 from public.abm_accounts a where a.id = account_id and a.owner_id = auth.uid()))
  with check (public.is_admin() or exists (select 1 from public.abm_accounts a where a.id = account_id and a.owner_id = auth.uid()));

-- notifications: own only
create policy notif_read on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notif_mark_read on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- audit log: admins read, nobody writes from the browser
create policy audit_read on public.audit_log for select to authenticated using (public.is_admin());

-- ---------- files ----------
-- Proof files live on disk (UPLOAD_DIR) locally, and in object storage later. The server streams a file
-- only after selecting its attachments row as the signed-in user, so the policies above decide access.
