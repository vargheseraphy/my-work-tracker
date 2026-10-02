-- 0001_schema.sql · Yallo GTM Tracker · tables, types, indexes
-- gen_random_uuid() is built into PostgreSQL 13 and later; no extension needed.

-- ---------- types ----------
create type public.app_role      as enum ('admin', 'contributor', 'viewer');
create type public.log_type      as enum ('daily', 'weekly');
create type public.value_type    as enum ('int', 'percent', 'text', 'file', 'list');
create type public.proof_type    as enum ('none', 'file', 'link');
create type public.entry_status  as enum ('draft', 'submitted', 'late', 'unlocked');
create type public.task_status   as enum ('Not started', 'In progress', 'Blocked', 'Done', 'Cancelled');
create type public.task_priority as enum ('High', 'Medium', 'Low');
create type public.abm_stage     as enum ('Research', 'Assets ready', 'Live', 'Engaged', 'Meeting booked', 'Closed');
create type public.vertical      as enum ('Yallo Talent', 'saasinator AI', 'Yallo AI Academy');
create type public.region        as enum ('UAE', 'KSA', 'UK', 'India', 'Other');
create type public.day_kind      as enum ('holiday', 'leave');
create type public.search_kind   as enum ('SEO', 'AEO', 'GEO');

-- ---------- 1 profiles ----------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  full_name   text not null check (length(full_name) between 1 and 80),
  role        public.app_role not null default 'contributor',
  timezone    text not null default 'Asia/Kolkata',
  work_days   smallint[] not null default '{1,2,3,4,5}',   -- ISO weekday numbers, 1 = Monday
  start_date  date not null default current_date,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- 2 app_settings ----------
create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ---------- 3 metric_definitions ----------
create table public.metric_definitions (
  key               text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  label             text not null,
  log_type          public.log_type not null,
  group_name        text not null,
  value_type        public.value_type not null default 'int',
  proof             public.proof_type not null default 'none',
  auto_from         text references public.metric_definitions (key),  -- weekly total summed from this daily metric
  is_target_measure boolean not null default false,
  sort_order        int not null default 100,
  active            boolean not null default true,
  check (auto_from is null or log_type = 'weekly')
);

-- ---------- 4 user_metric_settings ----------
create table public.user_metric_settings (
  user_id        uuid not null references public.profiles (id) on delete cascade,
  metric_key     text not null references public.metric_definitions (key),
  enabled        boolean not null default true,
  weekly_target  int check (weekly_target is null or weekly_target >= 0),
  primary key (user_id, metric_key)
);

-- ---------- 5 entries ----------
create table public.entries (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,
  log_type           public.log_type not null,
  period_start       date not null,                 -- the day, or the Monday of the week
  status             public.entry_status not null default 'draft',
  is_late            boolean not null default false,
  submitted_at       timestamptz,
  unlocked_by        uuid references public.profiles (id),
  unlock_reason      text,
  no_search_activity boolean not null default false,
  auto_totals        jsonb,                         -- weekly: frozen daily totals at submit
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, log_type, period_start),
  check (log_type = 'daily' or extract(isodow from period_start) = 1),
  check (status <> 'unlocked' or unlock_reason is not null)
);
create index entries_period_idx on public.entries (period_start, log_type);

-- ---------- 6 entry_values ----------
create table public.entry_values (
  entry_id    uuid not null references public.entries (id) on delete cascade,
  metric_key  text not null references public.metric_definitions (key),
  num_value   numeric check (num_value is null or num_value >= 0),
  text_value  text check (text_value is null or length(text_value) <= 2000),
  note        text check (note is null or length(note) <= 500),
  updated_at  timestamptz not null default now(),
  primary key (entry_id, metric_key)
);

-- ---------- 7 tasks ----------
create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(title) between 1 and 200),
  description   text check (description is null or length(description) <= 4000),
  assignee_id   uuid not null references public.profiles (id),
  due_date      date not null,
  priority      public.task_priority not null default 'Medium',
  status        public.task_status not null default 'Not started',
  status_note   text,
  proof_url     text,
  completed_at  timestamptz,
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index tasks_assignee_idx on public.tasks (assignee_id, status);
create index tasks_due_idx on public.tasks (due_date) where status not in ('Done', 'Cancelled');

-- ---------- 8 task_updates ----------
create table public.task_updates (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id) on delete cascade,
  user_id     uuid not null references public.profiles (id),
  status      public.task_status not null,
  note        text check (note is null or length(note) <= 1000),
  proof_url   text,
  local_date  date not null,
  created_at  timestamptz not null default now()
);
create index task_updates_task_idx on public.task_updates (task_id, local_date);

-- ---------- 9 attachments ----------
create table public.attachments (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles (id),
  entry_id      uuid references public.entries (id) on delete cascade,
  task_id       uuid references public.tasks (id) on delete cascade,
  metric_key    text references public.metric_definitions (key),
  storage_path  text not null unique,
  file_name     text not null,
  mime_type     text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')),
  size_bytes    int not null check (size_bytes between 1 and 5242880),
  created_at    timestamptz not null default now(),
  check ((entry_id is not null)::int + (task_id is not null)::int = 1),
  check (entry_id is null or metric_key is not null)
);
create index attachments_entry_idx on public.attachments (entry_id, metric_key);

-- ---------- 10 abm_accounts ----------
create table public.abm_accounts (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(name) between 1 and 120),
  vertical      public.vertical not null,
  region        public.region not null,
  owner_id      uuid not null references public.profiles (id),
  planned_week  date not null check (extract(isodow from planned_week) = 1),
  stage         public.abm_stage not null default 'Research',
  notes         text,
  research_url  text,
  deck_url      text,
  landing_url   text,
  live_at       timestamptz,
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index abm_week_idx on public.abm_accounts (planned_week);

-- ---------- 11 abm_weekly_touches ----------
create table public.abm_weekly_touches (
  account_id  uuid not null references public.abm_accounts (id) on delete cascade,
  week_start  date not null check (extract(isodow from week_start) = 1),
  emails      int not null default 0 check (emails >= 0),
  messages    int not null default 0 check (messages >= 0),
  calls       int not null default 0 check (calls >= 0),
  updated_by  uuid references public.profiles (id),
  updated_at  timestamptz not null default now(),
  primary key (account_id, week_start)
);

-- ---------- 12 search_activities ----------
create table public.search_activities (
  id           uuid primary key default gen_random_uuid(),
  entry_id     uuid not null references public.entries (id) on delete cascade,
  kind         public.search_kind not null,
  description  text not null check (length(description) between 1 and 300),
  link         text check (link is null or link ~ '^https?://'),
  created_at   timestamptz not null default now()
);

-- ---------- 13 entry_abm_accounts ----------
create table public.entry_abm_accounts (
  entry_id    uuid not null references public.entries (id) on delete cascade,
  account_id  uuid not null references public.abm_accounts (id) on delete cascade,
  primary key (entry_id, account_id)
);

-- ---------- 14 calendar_days ----------
create table public.calendar_days (
  id          uuid primary key default gen_random_uuid(),
  day         date not null,
  user_id     uuid references public.profiles (id) on delete cascade,  -- null = everyone
  kind        public.day_kind not null,
  label       text not null check (length(label) between 1 and 80),
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  check ((kind = 'holiday') = (user_id is null)),
  unique nulls not distinct (day, user_id)
);

-- ---------- 15 reminder_rules ----------
create table public.reminder_rules (
  key          text primary key,
  description  text not null,
  local_time   time not null,
  dow          smallint check (dow between 1 and 7),   -- null = every working day
  to_admin     boolean not null default false,
  email        boolean not null default true,
  in_app       boolean not null default true,
  active       boolean not null default true
);

-- ---------- 16 notifications ----------
create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  rule_key      text not null,
  ref_id        uuid,                     -- task or entry the reminder is about
  local_date    date not null,
  title         text not null,
  body          text not null,
  link          text,
  read_at       timestamptz,
  email_status  text not null default 'pending' check (email_status in ('pending', 'sent', 'failed', 'skipped')),
  created_at    timestamptz not null default now(),
  unique nulls not distinct (user_id, rule_key, local_date, ref_id)
);
create index notifications_user_idx on public.notifications (user_id, read_at);

-- ---------- 17 audit_log ----------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  row_id      text not null,
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor_id    uuid,
  old_data    jsonb,
  new_data    jsonb,
  at          timestamptz not null default now()
);
create index audit_row_idx on public.audit_log (table_name, row_id);
