-- Lists any of the 10 functions that differ from their current version, ignoring spaces and line breaks.
-- No rows = everything is current.
select e.name as function_needing_repair
from (values
  ('mfa_ok','a7dcf47f6268b87e7cbacf1bce15bea4'),
  ('is_lab','68e2b6b23fe0114e324ec29a3fd27b88'),
  ('my_clinic','76ac56d95ed441c5e0f4c432a187ac6b'),
  ('next_seq_internal','1f57f3faecb891636043446629be0b16'),
  ('next_seq','afc45f16b7dd4da05ca7267550d5323a'),
  ('tg_stamp','62891d48bcb58e61e2885971320c3f50'),
  ('tg_orders_guard','c1394c8728a529ad9ac50d46adbbf1c0'),
  ('tg_clinics_guard','be4b3455279acece5fe88b8b0a6d09d3'),
  ('tg_audit','f8424afdb90713898422dd1fa070b3bb'),
  ('register_clinic','5d51794c896b6a1ec20c5ea059824b96')
) as e(name, fingerprint)
left join pg_proc p on p.proname = e.name and p.pronamespace = 'public'::regnamespace
where p.oid is null or md5(regexp_replace(p.prosrc, '\s+', '', 'g')) <> e.fingerprint;
