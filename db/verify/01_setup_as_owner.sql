-- Run as the OWNER role. Creates invented test users. Use only on a throwaway database.
\set ON_ERROR_STOP 0
\pset pager off
-- users
insert into auth.users (id,email) values ('00000000-0000-0000-0000-00000000000a','admin@x.co'),('00000000-0000-0000-0000-00000000000c','c@x.co'),('00000000-0000-0000-0000-00000000000d','d@x.co');
-- every day is a working day for these test users, so the checks give the same result on any weekday or weekend
insert into profiles (id,email,full_name,role,start_date,work_days) values
 ('00000000-0000-0000-0000-00000000000a','admin@x.co','Admin','admin', current_date-30, '{1,2,3,4,5,6,7}'),
 ('00000000-0000-0000-0000-00000000000c','c@x.co','Tanzil','contributor', current_date-20, '{1,2,3,4,5,6,7}'),
 ('00000000-0000-0000-0000-00000000000d','d@x.co','Anil','contributor', current_date-20, '{1,2,3,4,5,6,7}');
insert into entries (user_id, log_type, period_start, status) values ('00000000-0000-0000-0000-00000000000d','daily', current_date-1,'submitted');

