-- First Bio Genetics LIMS: complete audit trail
-- Run once in the Supabase SQL editor after 0001_init.sql.
-- Adds: which fields changed, deletions, access (role) changes, settings changes,
-- app-reported events (view, print, export, sign-in, sign-out), and tamper protection.

create or replace function public.tg_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare r jsonb; o jsonb; v_id text; v_detail jsonb; v_changed text[];
begin
  if tg_op <> 'DELETE' then r := to_jsonb(new); end if;
  if tg_op <> 'INSERT' then o := to_jsonb(old); end if;
  v_id := coalesce(r->>'id', r->>'key', r->>'user_id', o->>'id', o->>'key', o->>'user_id');

  if tg_table_name = 'profiles' then
    v_detail := jsonb_build_object('role', coalesce(r->>'role', o->>'role'),
                                   'clinic', coalesce(r->>'clinic_id', o->>'clinic_id'),
                                   'email', coalesce(r->>'email', o->>'email'));
    if tg_op = 'UPDATE' then
      v_detail := v_detail || jsonb_build_object('previousRole', o->>'role', 'previousClinic', o->>'clinic_id');
    end if;
  elsif tg_op = 'UPDATE' then
    select coalesce(array_agg(k order by k), '{}') into v_changed
    from (select jsonb_object_keys(coalesce(o->'data', '{}'::jsonb) || coalesce(r->'data', '{}'::jsonb)) as k) x
    where (o->'data'->k) is distinct from (r->'data'->k);
    if coalesce(array_length(v_changed, 1), 0) = 0 then return null; end if;  -- nothing actually changed
    v_detail := jsonb_build_object('changed', to_jsonb(v_changed));
    if (o->'data'->>'status') is distinct from (r->'data'->>'status') then
      v_detail := v_detail || jsonb_build_object('status', jsonb_build_array(o->'data'->>'status', r->'data'->>'status'));
    end if;
  end if;

  insert into audit_log(actor, action, tbl, row_id, detail)
  values (auth.uid(), lower(tg_op), tg_table_name, v_id, v_detail);
  return null;
end $$;

do $$ declare t text; begin
  foreach t in array array['clinics','patients','orders','claims','settings','profiles'] loop
    execute format('drop trigger if exists audit on public.%I', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.tg_audit()', t);
  end loop;
end $$;

-- Events the portal reports itself.
drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log for insert to authenticated
  with check (actor = auth.uid() and action in ('view','print','export','sign_in','sign_out') and public.mfa_ok());

-- The audit log can only grow: no edits, deletes or truncation, by anyone.
create or replace function public.tg_audit_immutable() returns trigger
language plpgsql as $$ begin raise exception 'The audit log cannot be changed or deleted'; end $$;
drop trigger if exists immutable on public.audit_log;
create trigger immutable before update or delete on public.audit_log
  for each row execute function public.tg_audit_immutable();
drop trigger if exists immutable_truncate on public.audit_log;
create trigger immutable_truncate before truncate on public.audit_log
  for each statement execute function public.tg_audit_immutable();

create index if not exists audit_at_idx on public.audit_log (at desc);
create index if not exists audit_actor_idx on public.audit_log (actor, at desc);
