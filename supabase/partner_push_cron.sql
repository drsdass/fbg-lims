-- First Bio Genetics LIMS: retry partner result deliveries every 5 minutes (only needed when a partner lab receives
-- reports at its own webhook; partners that collect reports with results.pull don't need it).
-- The portal sends each report the moment it's released; this job resends anything the partner's system didn't accept
-- (their system was down, a timeout, a message they refused). It runs inside Supabase, so no computer needs to be on.
--
-- Before running:
--   1. Database > Extensions: enable pg_cron and pg_net.
--   2. Edge Functions > Secrets: add PARTNER_CRON_SECRET (any long random text) and use the same value below.
--   3. Replace <PROJECT_REF> with your project's reference (the part before .supabase.co in the project URL).
-- Run once in the SQL editor. To stop it: select cron.unschedule('fbg-partner-push');

select cron.schedule(
  'fbg-partner-push',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/partner-api',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<PARTNER_CRON_SECRET>'),
    body := jsonb_build_object('action', 'results.push')
  );
  $$
);
