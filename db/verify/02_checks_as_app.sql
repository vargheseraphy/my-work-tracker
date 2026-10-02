-- Run as gtm_app (the server's login role). Expected results are in db/verify/README.md.
create function pg_temp.as_user(u text) returns void language sql as $$ select set_config('app.user_id', u, false); $$;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
\echo '--- 1 open today and submit empty'
select id as today_id from open_entry('daily', local_today(auth.uid())) \gset
select submit_entry(:'today_id') ->> 'ok' as ok, jsonb_array_length(submit_entry(:'today_id')->'errors') as n_errors;
\echo '--- 2 missing days blocking'
select jsonb_path_query_array(submit_entry(:'today_id')->'errors', '$[*] ? (@ like_regex "^Submit")') as order_errors;
\echo '--- 3 old day outside window'
select open_entry('daily', (select max(d) from working_days_between(auth.uid(), current_date-15, current_date-8) d));
\echo '--- 4 fill the two backfill days and submit'
do $$ declare d date; eid uuid; r jsonb; begin
  for d in select x from missing_days(auth.uid()) x where within_backfill(auth.uid(), x) loop
    eid := (open_entry('daily', d)).id;
    insert into entry_values (entry_id, metric_key, num_value)
      select eid, key, 0 from metric_definitions where log_type='daily';
    update entry_values set num_value = 40 where entry_id = eid and metric_key='contacts_added';
    update entry_values set num_value = 30 where entry_id = eid and metric_key='contacts_filtered';
    r := submit_entry(eid); raise notice 'backfill % -> %', d, r;
  end loop; end $$;
\echo '--- 5 today: filtered > added, and proof missing'
insert into entry_values (entry_id, metric_key, num_value) select :'today_id', key, 0 from metric_definitions where log_type='daily';
update entry_values set num_value = 10 where entry_id = :'today_id' and metric_key='contacts_added';
update entry_values set num_value = 20 where entry_id = :'today_id' and metric_key='contacts_filtered';
update entry_values set num_value = 5 where entry_id = :'today_id' and metric_key='comments';
select submit_entry(:'today_id')->'errors' as errs;
\echo '--- 6 fix, attach proof, submit'
update entry_values set num_value = 8 where entry_id = :'today_id' and metric_key='contacts_filtered';
insert into attachments (owner_id, entry_id, metric_key, storage_path, file_name, mime_type, size_bytes)
 values (auth.uid(), :'today_id', 'comments', auth.uid() || '/' || :'today_id' || '/a.png', 'a.png', 'image/png', 1000);
select submit_entry(:'today_id') as result;
\echo '--- 7 edits after lock must fail'
update entry_values set num_value = 99 where entry_id = :'today_id' and metric_key='likes';
update entries set status='draft' where id = :'today_id';
insert into entries (user_id, log_type, period_start) values (auth.uid(),'daily', current_date);
\echo '--- 8 cannot see Anil entries or audit log'
select count(*) as anil_rows from entries where user_id='00000000-0000-0000-0000-00000000000d';
select count(*) as audit_rows from audit_log;
\echo '--- 9 contributor cannot unlock or create task'
select unlock_entry(auth.uid(),'daily',current_date,'x');
insert into tasks (title, assignee_id, due_date, created_by) values ('x', auth.uid(), current_date, auth.uid());
\echo '--- 10 admin creates task, unlocks, sees all'
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into tasks (title, assignee_id, due_date, created_by) values ('Clean list', '00000000-0000-0000-0000-00000000000c', current_date-1, auth.uid()) returning id as task_id \gset
select count(*) as all_entries from entries;
select status, unlock_reason from unlock_entry('00000000-0000-0000-0000-00000000000c','daily',current_date,'emails count wrong');
select count(*) as audit_rows_admin from audit_log;
\echo '--- 11 contributor: task done without proof, then with'
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select update_task(:'task_id','Done','finished',null);
select status from update_task(:'task_id','In progress','working on it');
\echo '--- 12 compliance as contributor (should be empty) and admin'
select count(*) from dashboard_compliance(current_date);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select status, count(*) from dashboard_compliance(current_date) group by 1 order by 1;
select * from dashboard_week(week_monday(current_date)) where user_id='00000000-0000-0000-0000-00000000000c' order by 2;
\echo '--- 13 reminders as the job runner (gtm_app, no user set)'
reset role; set role gtm_app; select set_config('app.user_id','',false);
select rule_key, title from queue_due_reminders((current_date + time '10:05') at time zone 'Asia/Kolkata');
select count(*) as dup_run from queue_due_reminders((current_date + time '10:05') at time zone 'Asia/Kolkata') where created_at > now() - interval '1 second' and false;
reset role; set role authenticated;
select queue_due_reminders();
\echo '--- 14 email queue as job runner'
reset role; set role gtm_app; select set_config('app.user_id','',false);
select rule_key, email_on from pending_emails();
\echo '--- 15 web role cannot read auth tables or run email helpers'
reset role; set role authenticated;
select count(*) from auth.sessions;
select * from pending_emails();
