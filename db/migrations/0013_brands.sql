-- 0013_brands.sql · Repotra
-- Internal brands, so channel activity can be recorded per account rather than blended.
--
-- A "brand" here is one of your own company accounts (saasinator AI, Yallo Talent, Yallo AI
-- Academy), not a prospect. Prospects live in abm_accounts, which has its own `vertical` column
-- naming the same three lines. The two are deliberately left apart for now: abm_accounts.vertical
-- is an enum baked into existing rows, and changing it is a separate job. If they are ever
-- merged, this table is the one to keep.
--
-- A table, not an enum, so an admin can add a fourth line without a migration.
--
-- Scope decided with Raphy: only channel activity is per brand. CRM work (accounts found and
-- added, contacts added and filtered) stays a single total, because a contact belongs to a
-- company rather than to one of our brands. Targets also stay total across brands.

create table public.brands (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(btrim(name)) between 1 and 60),
  active     boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now()
);

comment on table public.brands is
  'Our own company accounts. Channel activity is logged per brand; CRM work is not.';

insert into public.brands (name, sort_order) values
  ('saasinator AI', 10),
  ('Yallo Talent', 20),
  ('Yallo AI Academy', 30);

-- Who works on which brand. Overlap is the point: two people can share a brand, and one person
-- can run several, which is what the old one-person-per-line arrangement could not express.
create table public.user_brands (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  primary key (user_id, brand_id)
);

comment on table public.user_brands is
  'Brand assignments. A person logs channel activity once per brand they are assigned.';

-- Which measures split by brand.
alter table public.metric_definitions
  add column per_brand boolean not null default false;

comment on column public.metric_definitions.per_brand is
  'When true, a value is expected once per brand the person is assigned, not once per entry.';

update public.metric_definitions set per_brand = true
 where key in (
   -- LinkedIn and outreach, daily
   'posts', 'comments', 'likes', 'dms', 'emails', 'replies', 'posters', 'newsletters',
   -- channel results, weekly
   'wk_posts', 'wk_emails', 'wk_replies', 'wk_calls', 'wk_meetings',
   'wk_open_rate', 'wk_impressions', 'wk_followers', 'wk_forms', 'wk_form_companies',
   'wk_ga_users', 'wk_ga_sessions', 'wk_ga_top_page'
 );

-- The value itself gains the brand dimension. Null means "not a per-brand measure", which is
-- why the unique index treats nulls as equal: one shared row per metric, as before.
alter table public.entry_values
  add column brand_id uuid references public.brands (id) on delete restrict;

alter table public.entry_values drop constraint entry_values_pkey;
alter table public.entry_values
  add constraint entry_values_key unique nulls not distinct (entry_id, metric_key, brand_id);

create index entry_values_brand_idx on public.entry_values (brand_id);

-- ---------- security ----------
alter table public.brands enable row level security;
alter table public.user_brands enable row level security;

revoke all on public.brands, public.user_brands from public;
grant select on public.brands, public.user_brands to authenticated;
grant insert, update, delete on public.brands, public.user_brands to authenticated;  -- admin-only policies below

-- Everyone signed in needs to read the brand list to fill a log in.
create policy brands_read on public.brands
  for select to authenticated using (public.is_active_user());
create policy brands_admin on public.brands
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- A person sees their own assignments; an admin sees and sets everyone's.
create policy user_brands_read on public.user_brands
  for select to authenticated using (user_id = auth.uid() or public.can_read_all());
create policy user_brands_admin on public.user_brands
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
