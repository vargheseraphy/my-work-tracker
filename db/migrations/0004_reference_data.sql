-- 0004_reference_data.sql · settings, metric definitions, reminder rules (safe for production)

insert into public.app_settings (key, value) values
  ('daily_due_time',        '"19:00"'),
  ('backfill_working_days', '2'),
  ('weekly_open_time',      '"16:00"'),
  ('weekly_due_time',       '"12:00"'),
  ('spike_multiplier',      '3'),
  ('spike_min_avg',         '5'),
  ('report_recipients',     '[]')                 -- set the admin email(s) at setup
on conflict (key) do nothing;

insert into public.metric_definitions (key, label, log_type, group_name, value_type, proof, auto_from, is_target_measure, sort_order) values
  -- daily
  ('posts',              'Posts published',                'daily',  'LinkedIn', 'int',     'link', null, true,  10),
  ('comments',           'Comments made',                  'daily',  'LinkedIn', 'int',     'file', null, false, 20),
  ('likes',              'Likes given',                    'daily',  'LinkedIn', 'int',     'none', null, false, 30),
  ('dms',                'Direct messages sent',           'daily',  'LinkedIn', 'int',     'file', null, true,  40),
  ('emails',             'Emails sent',                    'daily',  'Email',    'int',     'file', null, true,  50),
  ('templates',          'Accumba mail templates created', 'daily',  'Email',    'int',     'link', null, false, 60),
  ('replies',            'Replies received',               'daily',  'Email',    'int',     'none', null, false, 70),
  ('accounts_found',     'New accounts found',             'daily',  'Accounts', 'int',     'none', null, false, 80),
  ('accounts_added',     'New accounts added to CRM',      'daily',  'Accounts', 'int',     'none', null, true,  90),
  ('contacts_added',     'Contacts added',                 'daily',  'Accounts', 'int',     'none', null, true,  100),
  ('contacts_filtered',  'Contacts filtered (qualified)',  'daily',  'Accounts', 'int',     'none', null, false, 110),
  ('posters',            'Posters created',                'daily',  'Content',  'int',     'file', null, false, 120),
  ('newsletters',        'Newsletter campaigns launched',  'daily',  'Content',  'int',     'link', null, false, 130)
on conflict (key) do nothing;

insert into public.metric_definitions (key, label, log_type, group_name, value_type, proof, auto_from, is_target_measure, sort_order) values
  ('wk_accounts_added',  'Accounts added',                 'weekly', 'Outreach', 'int',     'none', 'accounts_added', false, 10),
  ('wk_emails',          'Emails sent',                    'weekly', 'Outreach', 'int',     'none', 'emails',         false, 20),
  ('wk_replies',         'Replies',                        'weekly', 'Outreach', 'int',     'none', 'replies',        false, 30),
  ('wk_posts',           'Posts',                          'weekly', 'Social',   'int',     'none', 'posts',          false, 40),
  ('wk_calls',           'Calls made',                     'weekly', 'Outreach', 'int',     'none', null, true,  50),
  ('wk_meetings',        'Meetings booked',                'weekly', 'Outreach', 'int',     'none', null, true,  60),
  ('wk_open_rate',       'Email open rate (%)',            'weekly', 'Outreach', 'percent', 'file', null, false, 70),
  ('wk_impressions',     'Impressions this week',          'weekly', 'Social',   'int',     'file', null, false, 80),
  ('wk_followers',       'Followers at week end',          'weekly', 'Social',   'int',     'none', null, false, 90),
  ('wk_forms',           'Website form responses',         'weekly', 'Website',  'int',     'none', null, false, 100),
  ('wk_form_companies',  'Which companies?',               'weekly', 'Website',  'text',    'none', null, false, 110),
  ('wk_ga_report',       'Google Analytics weekly report', 'weekly', 'Website',  'file',    'none', null, false, 120),
  ('wk_ga_users',        'Users',                          'weekly', 'Website',  'int',     'none', null, false, 130),
  ('wk_ga_sessions',     'Sessions',                       'weekly', 'Website',  'int',     'none', null, false, 140),
  ('wk_ga_top_page',     'Top page',                       'weekly', 'Website',  'text',    'none', null, false, 150),
  ('wk_search',          'SEO, AEO and GEO activities',    'weekly', 'Search',   'list',    'none', null, false, 160),
  ('wk_reflect_worked',  'What worked this week?',         'weekly', 'Reflection','text',   'none', null, false, 170),
  ('wk_reflect_not',     'What did not work?',             'weekly', 'Reflection','text',   'none', null, false, 180),
  ('wk_reflect_focus',   'Your one focus for next week',   'weekly', 'Reflection','text',   'none', null, false, 190)
on conflict (key) do nothing;

insert into public.reminder_rules (key, description, local_time, dow, to_admin) values
  ('daily_not_started', 'Daily log not started',            '17:00', null, false),
  ('daily_deadline',    'Daily log not submitted',          '19:00', null, false),
  ('day_missed',        'Previous working day missing',     '10:00', null, false),
  ('two_days_missed',   'Two working days missing in a row','10:00', null, true),
  ('weekly_open',       'Weekly log is open',               '16:00', 5,    false),
  ('weekly_overdue',    'Last week''s log not submitted',   '12:00', 1,    true),
  ('task_due_soon',     'Task due tomorrow',                '10:00', null, false),
  ('task_due_today',    'Task due today',                   '10:00', null, false),
  ('task_overdue',      'Task overdue',                     '10:00', null, false),
  ('abm_not_planned',   'No ABM account planned this week', '10:00', 1,    true),
  ('abm_not_live',      'This week''s ABM account not live','10:00', 4,    true),
  ('monday_summary',    'Monday summary to admin',          '09:00', 1,    true)
on conflict (key) do nothing;
