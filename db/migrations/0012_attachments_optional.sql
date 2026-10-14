-- 0012_attachments_optional.sql · Repotra
-- File proof is switched off for now. The upload UI stays on screen but inert, so the feature
-- is visible as "coming later" rather than disappearing and surprising people when it returns.
--
-- Only 'file' proof is relaxed. Link proof is untouched: pasting a URL to a post you published
-- is not an attachment, costs nothing, and remains a useful check.
--
-- This is reference data, not a rule change: submit_entry still enforces proof wherever a metric
-- asks for it. Turning uploads back on is one update, with no code change:
--
--   update public.metric_definitions set proof = 'file'
--    where key in ('comments', 'dms', 'emails', 'posters', 'wk_open_rate', 'wk_impressions');
--
-- That list is the exact set this migration changed, recorded at the time it ran. Link proof
-- (posts, templates, newsletters) was left as it was.

update public.metric_definitions
   set proof = 'none'
 where proof = 'file';
