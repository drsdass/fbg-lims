-- =====================================================================================
-- First Bio Genetics LIMS: complete database setup for a NEW Supabase project
-- Paste this whole file into the SQL Editor of the production project and run it once.
-- It is the migrations 0001 through 0011 in order; do NOT run it on a project that already has them.
-- Afterwards: deploy the Edge Functions (manage-users, send-alerts, instrument-upload, patient-access),
-- create the first admin user (see README), and set the function secrets.
-- =====================================================================================

-- Safety check: stop immediately if this project already has the FBG database.
do $$ begin
  if to_regclass('public.profiles') is not null then
    raise exception 'This project already has the FBG database. setup_production.sql is only for a new, empty project. Nothing was changed.';
  end if;
end $$;


-- #####################################################################################
-- 0001_init.sql
-- #####################################################################################
-- First Bio Genetics LIMS: initial schema
-- Run once in the Supabase SQL editor (or with `supabase db push`).
-- Requires a HIPAA-enabled Supabase project (Team plan + HIPAA add-on + signed BAA).

create extension if not exists pgcrypto;

-- ---------- tables ----------
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('lab','clinic')),
  clinic_id  text,
  name       text not null default '',
  email      text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.clinics (
  id text primary key, data jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), updated_by uuid
);
create table if not exists public.patients (
  id text primary key, clinic_id text not null, data jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), updated_by uuid
);
create table if not exists public.orders (
  id text primary key, clinic_id text not null, data jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), updated_by uuid
);
create table if not exists public.notes (
  id text primary key, aud text not null, data jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), updated_by uuid
);
create table if not exists public.claims (
  id text primary key, data jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), updated_by uuid
);
create table if not exists public.outbox (
  id text primary key, data jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), updated_by uuid
);
create table if not exists public.settings (
  key text primary key, data jsonb not null,
  updated_at timestamptz not null default now(), updated_by uuid
);
create table if not exists public.seqs (name text primary key, value bigint not null);
create table if not exists public.audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor uuid default auth.uid(),
  action text not null,
  tbl text not null,
  row_id text,
  detail jsonb
);

create index if not exists patients_clinic_idx on public.patients (clinic_id);
create index if not exists orders_clinic_idx on public.orders (clinic_id);
create index if not exists notes_aud_idx on public.notes (aud);
create index if not exists audit_row_idx on public.audit_log (tbl, row_id);

-- ---------- who is signed in ----------
-- Every data policy requires two-step verification (aal2).
create or replace function public.mfa_ok() returns boolean
language sql stable as $$ select coalesce(auth.jwt()->>'aal','') = 'aal2' $$;

create or replace function public.is_lab() returns boolean
language sql stable security definer set search_path = public as $$
  select public.mfa_ok() and exists (select 1 from profiles where user_id = auth.uid() and role = 'lab')
$$;

create or replace function public.my_clinic() returns text
language sql stable security definer set search_path = public as $$
  select case when public.mfa_ok()
    then (select clinic_id from profiles where user_id = auth.uid() and role = 'clinic') end
$$;

-- ---------- sequences ----------
create or replace function public.next_seq_internal(p_name text) returns bigint
language sql security definer set search_path = public as $$
  insert into seqs(name, value) values (p_name, 1001)
  on conflict (name) do update set value = seqs.value + 1
  returning value
$$;

create or replace function public.next_seq(p_name text) returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if p_name not in ('accession') then raise exception 'Unknown sequence'; end if;
  if not (public.is_lab() or public.my_clinic() is not null) then raise exception 'Not authorized'; end if;
  return public.next_seq_internal(p_name);
end $$;

-- ---------- triggers ----------
create or replace function public.tg_stamp() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_table_name in ('patients','orders') then new.clinic_id := new.data->>'clinicId'; end if;
  if tg_table_name = 'notes' then new.aud := new.data->>'aud'; end if;
  return new;
end $$;

-- Clinics may create orders and mark results as read; everything else is lab-only.
create or replace function public.tg_orders_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_lab() then return new; end if;
  if tg_op = 'INSERT' then
    if exists (select 1 from orders where id = new.id) then return new; end if;
    if coalesce(new.data->>'status','') <> 'Ordered'
       or coalesce(new.data->'results','{}'::jsonb) <> '{}'::jsonb then
      raise exception 'Clinics can only submit new orders';
    end if;
  elsif (new.data - 'readAt' - 'flags') is distinct from (old.data - 'readAt' - 'flags') then
    raise exception 'Orders cannot be changed after they are submitted';
  end if;
  return new;
end $$;

-- Clinics may edit their own profile, but not their status or account number.
create or replace function public.tg_clinics_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_lab() or current_setting('fbg.registering', true) = '1' then return new; end if;
  if tg_op = 'INSERT' then raise exception 'Clinics are created through registration'; end if;
  if new.data->'status' is distinct from old.data->'status'
     or new.data->'acct' is distinct from old.data->'acct'
     or new.id is distinct from old.id then
    raise exception 'Only the lab can change clinic status or account number';
  end if;
  return new;
end $$;

create or replace function public.tg_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log(actor, action, tbl, row_id) values (auth.uid(), lower(tg_op), tg_table_name, new.id);
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['clinics','patients','orders','notes','claims','outbox'] loop
    execute format('drop trigger if exists stamp on public.%I', t);
    execute format('create trigger stamp before insert or update on public.%I for each row execute function public.tg_stamp()', t);
  end loop;
  foreach t in array array['clinics','patients','orders','claims'] loop
    execute format('drop trigger if exists audit on public.%I', t);
    execute format('create trigger audit after insert or update on public.%I for each row execute function public.tg_audit()', t);
  end loop;
end $$;
drop trigger if exists guard on public.orders;
create trigger guard before insert or update on public.orders for each row execute function public.tg_orders_guard();
drop trigger if exists guard on public.clinics;
create trigger guard before insert or update on public.clinics for each row execute function public.tg_clinics_guard();

-- ---------- clinic registration ----------
create or replace function public.register_clinic(p_clinic jsonb, p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare v_n bigint; v_id text; v_nid text := 'n' || replace(gen_random_uuid()::text, '-', ''); v_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from profiles where user_id = auth.uid()) then raise exception 'This account is already registered'; end if;
  v_n := public.next_seq_internal('clinic_acct');
  v_id := 'c' || v_n::text;
  perform set_config('fbg.registering', '1', true);
  insert into clinics(id, data) values (v_id,
    p_clinic || jsonb_build_object('id', v_id, 'acct', 'FBG-' || v_n::text, 'status', 'pending', 'createdAt', v_ms));
  insert into profiles(user_id, role, clinic_id, name, email)
    values (auth.uid(), 'clinic', v_id, coalesce(p_name, ''), coalesce((select email from auth.users where id = auth.uid()), ''));
  insert into notes(id, aud, data) values (v_nid, 'lab', jsonb_build_object(
    'id', v_nid, 'aud', 'lab', 'orderId', null,
    'title', 'New clinic registration',
    'body', coalesce(p_clinic->>'name', 'A clinic') || ' submitted onboarding and is waiting for approval.',
    'level', 'info', 'at', v_ms, 'read', false));
  return v_id;
end $$;

-- ---------- row level security ----------
alter table public.profiles  enable row level security;
alter table public.clinics   enable row level security;
alter table public.patients  enable row level security;
alter table public.orders    enable row level security;
alter table public.notes     enable row level security;
alter table public.claims    enable row level security;
alter table public.outbox    enable row level security;
alter table public.settings  enable row level security;
alter table public.seqs      enable row level security;
alter table public.audit_log enable row level security;

create policy profiles_read on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.is_lab());

create policy clinics_read on public.clinics for select to authenticated
  using (public.is_lab() or id = public.my_clinic());
create policy clinics_update on public.clinics for update to authenticated
  using (public.is_lab() or id = public.my_clinic()) with check (public.is_lab() or id = public.my_clinic());
create policy clinics_insert on public.clinics for insert to authenticated with check (public.is_lab());

create policy patients_read on public.patients for select to authenticated
  using (public.is_lab() or clinic_id = public.my_clinic());
create policy patients_insert on public.patients for insert to authenticated
  with check (public.is_lab() or clinic_id = public.my_clinic());
create policy patients_update on public.patients for update to authenticated
  using (public.is_lab() or clinic_id = public.my_clinic()) with check (public.is_lab() or clinic_id = public.my_clinic());

create policy orders_read on public.orders for select to authenticated
  using (public.is_lab() or clinic_id = public.my_clinic());
create policy orders_insert on public.orders for insert to authenticated
  with check (public.is_lab() or clinic_id = public.my_clinic());
create policy orders_update on public.orders for update to authenticated
  using (public.is_lab() or clinic_id = public.my_clinic()) with check (public.is_lab() or clinic_id = public.my_clinic());

create policy notes_read on public.notes for select to authenticated
  using ((aud = 'lab' and public.is_lab()) or aud = public.my_clinic());
create policy notes_insert on public.notes for insert to authenticated
  with check (public.is_lab() or (aud = 'lab' and public.my_clinic() is not null));
create policy notes_update on public.notes for update to authenticated
  using ((aud = 'lab' and public.is_lab()) or aud = public.my_clinic())
  with check ((aud = 'lab' and public.is_lab()) or aud = public.my_clinic());

create policy claims_all on public.claims for all to authenticated using (public.is_lab()) with check (public.is_lab());
create policy outbox_all on public.outbox for all to authenticated using (public.is_lab()) with check (public.is_lab());

create policy settings_read on public.settings for select to authenticated
  using (public.is_lab() or (key = 'lab' and public.my_clinic() is not null));
create policy settings_write on public.settings for insert to authenticated with check (public.is_lab());
create policy settings_update on public.settings for update to authenticated using (public.is_lab()) with check (public.is_lab());

create policy audit_insert on public.audit_log for insert to authenticated
  with check (actor = auth.uid() and action = 'view' and public.mfa_ok());
create policy audit_read on public.audit_log for select to authenticated using (public.is_lab());
-- seqs: no policies, so it is reachable only through next_seq().

-- ---------- privileges ----------
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on function public.mfa_ok(), public.is_lab(), public.my_clinic() to authenticated;
grant execute on function public.next_seq(text), public.register_clinic(jsonb, text) to authenticated;
revoke execute on function public.next_seq_internal(text) from authenticated;
revoke delete on public.patients, public.orders, public.clinics, public.audit_log from authenticated;

-- ---------- lab profile shown on every report ----------
insert into public.settings(key, data) values ('lab', jsonb_build_object(
  'name', 'First Bio Genetics',
  'address', '1830 S. Alma School Rd Ste 134, Mesa, AZ 85210',
  'phone', '(480) 847-1916', 'email', 'info@firstbiogenetics.com',
  'clia', '03D2287865', 'director', 'Dr. Guihua Cao', 'directorCred', '',
  'npi', '', 'taxId', '', 'refLab', '', 'billingCo', '', 'billRef', false))
on conflict (key) do nothing;


-- #####################################################################################
-- 0002_audit.sql
-- #####################################################################################
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


-- #####################################################################################
-- 0003_roles.sql
-- #####################################################################################
-- First Bio Genetics LIMS: lab roles and user management
-- Run once in the Supabase SQL editor after 0001 and 0002.
--
-- Lab roles (a person can hold several):
--   admin      everything, including users and roles
--   scientist  receive, instruments, enter/verify/release results, send-outs, alerts
--   reporting  enter requisitions, receive, release (report out) verified results, alerts
--   sales      view/create/edit clinics, enter requisitions
--   billing    billing and claims, edit patient insurance
--   auditor    read-only, including results, billing and the audit log

alter table public.profiles add column if not exists lab_roles text[] not null default '{}';
alter table public.profiles add column if not exists active boolean not null default true;
alter table public.profiles add column if not exists must_change_pw boolean not null default false;

-- Current people
update public.profiles set lab_roles = '{admin}' where role = 'lab' and lower(email) = 'satishsdass@gmail.com';
update public.profiles set lab_roles = '{sales}' where role = 'lab' and lower(email) = 'rocky@firstbiogenetics.com';
-- Never leave the lab without an admin: if none matched, the first lab account becomes admin.
update public.profiles set lab_roles = '{admin}'
where user_id = (select user_id from public.profiles where role = 'lab' order by created_at limit 1)
  and not exists (select 1 from public.profiles where 'admin' = any(lab_roles));

-- ---------- permissions ----------
create or replace function public.role_perms(r text) returns text[]
language sql immutable as $$
  select case r
    when 'admin'     then array['*']
    when 'scientist' then array['clinics.view','orders.receive','instruments','sendouts','results.view','results.enter','results.release','alerts']
    when 'reporting' then array['clinics.view','orders.enter','orders.receive','sendouts','results.view','results.release','alerts']
    when 'sales'     then array['clinics.view','clinics.edit','orders.enter']
    when 'billing'   then array['clinics.view','billing','billing.view','patients.edit']
    when 'auditor'   then array['clinics.view','results.view','billing.view','audit']
    else array[]::text[] end
$$;

create or replace function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.mfa_ok() and exists (
    select 1 from profiles pr, unnest(pr.lab_roles) r
    where pr.user_id = auth.uid() and pr.role = 'lab' and pr.active
      and public.role_perms(r) && array['*', p])
$$;

-- Lab staff need at least one role and an active account; clinic users need an active account.
create or replace function public.is_lab() returns boolean
language sql stable security definer set search_path = public as $$
  select public.mfa_ok() and exists (select 1 from profiles where user_id = auth.uid() and role = 'lab' and active and cardinality(lab_roles) > 0)
$$;
create or replace function public.my_clinic() returns text
language sql stable security definer set search_path = public as $$
  select case when public.mfa_ok()
    then (select clinic_id from profiles where user_id = auth.uid() and role = 'clinic' and active) end
$$;

-- ---------- order rules ----------
create or replace function public.tg_orders_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_lab() then
    if tg_op = 'INSERT' then
      if exists (select 1 from orders where id = new.id) then return new; end if;
      if not public.has_perm('orders.enter') then raise exception 'Your role can''t enter orders'; end if;
      return new;
    end if;
    if (new.data->'results') is distinct from (old.data->'results') and not public.has_perm('results.enter') then
      raise exception 'Only scientists can enter or change results';
    end if;
    if (new.data->'verified') is distinct from (old.data->'verified') and not public.has_perm('results.enter') then
      raise exception 'Only scientists can verify results';
    end if;
    if (new.data->>'status') = 'Released' and (old.data->>'status') is distinct from 'Released' then
      if not public.has_perm('results.release') then raise exception 'Your role can''t release results'; end if;
      if not public.has_perm('results.enter') and (old.data->'verified') is null then
        raise exception 'A scientist must verify these results before they are reported';
      end if;
    elsif (new.data->>'status') is distinct from (old.data->>'status') then
      if not (public.has_perm('orders.receive') or public.has_perm('results.enter')) then
        raise exception 'Your role can''t change specimen status';
      end if;
    end if;
    if ((new.data->'tests') is distinct from (old.data->'tests') or (new.data->'confirm') is distinct from (old.data->'confirm'))
       and not (public.has_perm('results.enter') or public.has_perm('orders.enter') or public.has_perm('results.release')) then
      raise exception 'Your role can''t change the tests on an order';
    end if;
    return new;
  end if;
  -- clinic users
  if tg_op = 'INSERT' then
    if exists (select 1 from orders where id = new.id) then return new; end if;
    if coalesce(new.data->>'status','') <> 'Ordered' or coalesce(new.data->'results','{}'::jsonb) <> '{}'::jsonb then
      raise exception 'Clinics can only submit new orders';
    end if;
  elsif (new.data - 'readAt' - 'flags') is distinct from (old.data - 'readAt' - 'flags') then
    raise exception 'Orders cannot be changed after they are submitted';
  end if;
  return new;
end $$;

-- ---------- clinic rules ----------
create or replace function public.tg_clinics_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('fbg.registering', true) = '1' then return new; end if;
  if tg_op = 'INSERT' then raise exception 'Clinics are created through registration or the lab''s Add clinic'; end if;
  if public.is_lab() then
    if (new.data->'status') is distinct from (old.data->'status') or (new.data->'acct') is distinct from (old.data->'acct') then
      if not public.has_perm('clinics.approve') then raise exception 'Only an admin can approve or suspend clinics'; end if;
    elsif not (public.has_perm('clinics.edit') or public.has_perm('clinics.approve')) then
      raise exception 'Your role can''t edit clinics';
    end if;
    return new;
  end if;
  if new.data->'status' is distinct from old.data->'status' or new.data->'acct' is distinct from old.data->'acct' or new.id is distinct from old.id then
    raise exception 'Only the lab can change clinic status or account number';
  end if;
  return new;
end $$;

-- Lab (sales or admin) adds a clinic. Sales-created clinics start as pending until an admin approves.
create or replace function public.create_clinic(p_clinic jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_n bigint; v_id text; v_status text; v_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if not public.has_perm('clinics.edit') then raise exception 'Your role can''t add clinics'; end if;
  v_n := public.next_seq_internal('clinic_acct');
  v_id := 'c' || v_n::text;
  v_status := case when public.has_perm('clinics.approve') and p_clinic->>'status' = 'active' then 'active' else 'pending' end;
  perform set_config('fbg.registering', '1', true);
  insert into clinics(id, data) values (v_id,
    p_clinic || jsonb_build_object('id', v_id, 'acct', 'FBG-' || v_n::text, 'status', v_status, 'createdAt', v_ms));
  return v_id;
end $$;
grant execute on function public.create_clinic(jsonb) to authenticated;

-- ---------- table access by permission ----------
drop policy if exists patients_insert on public.patients;
drop policy if exists patients_update on public.patients;
create policy patients_insert on public.patients for insert to authenticated
  with check ((public.is_lab() and (public.has_perm('orders.enter') or public.has_perm('patients.edit'))) or clinic_id = public.my_clinic());
create policy patients_update on public.patients for update to authenticated
  using (public.is_lab() or clinic_id = public.my_clinic())
  with check ((public.is_lab() and (public.has_perm('orders.enter') or public.has_perm('patients.edit'))) or clinic_id = public.my_clinic());

drop policy if exists claims_all on public.claims;
create policy claims_read on public.claims for select to authenticated using (public.has_perm('billing') or public.has_perm('billing.view'));
create policy claims_insert on public.claims for insert to authenticated with check (public.has_perm('billing') or public.has_perm('results.release'));
create policy claims_update on public.claims for update to authenticated using (public.has_perm('billing')) with check (public.has_perm('billing'));

drop policy if exists outbox_all on public.outbox;
create policy outbox_read on public.outbox for select to authenticated using (public.has_perm('alerts'));
create policy outbox_insert on public.outbox for insert to authenticated with check (public.has_perm('alerts') or public.has_perm('results.release'));
create policy outbox_update on public.outbox for update to authenticated using (public.has_perm('alerts')) with check (public.has_perm('alerts'));

drop policy if exists settings_write on public.settings;
drop policy if exists settings_update on public.settings;
create policy settings_write on public.settings for insert to authenticated with check (public.has_perm('settings'));
create policy settings_update on public.settings for update to authenticated using (public.has_perm('settings')) with check (public.has_perm('settings'));

drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to authenticated using (public.has_perm('audit'));

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.has_perm('users') or public.has_perm('audit'));

-- ---------- user management (called only by the manage-users function) ----------
create or replace function public.admin_save_profile(p_actor uuid, p_user uuid, p_role text, p_lab_roles text[],
  p_clinic text, p_name text, p_email text, p_active boolean, p_must_change boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- attribute the change to the admin in the audit log
  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_actor::text, 'role', 'authenticated')::text, true);
  insert into profiles(user_id, role, lab_roles, clinic_id, name, email, active, must_change_pw)
  values (p_user, p_role, coalesce(p_lab_roles, '{}'), p_clinic, coalesce(p_name, ''), coalesce(p_email, ''), coalesce(p_active, true), coalesce(p_must_change, false))
  on conflict (user_id) do update set
    role = excluded.role, lab_roles = excluded.lab_roles, clinic_id = excluded.clinic_id,
    name = excluded.name, email = excluded.email, active = excluded.active,
    must_change_pw = coalesce(p_must_change, profiles.must_change_pw);
end $$;
revoke execute on function public.admin_save_profile(uuid, uuid, text, text[], text, text, text, boolean, boolean) from public, anon, authenticated;

-- A user clears their own "must change password" flag after setting a new password.
create or replace function public.password_changed() returns void
language sql security definer set search_path = public as $$
  update profiles set must_change_pw = false where user_id = auth.uid()
$$;
grant execute on function public.password_changed() to authenticated;

-- The manage-users function records password and two-step resets directly.
drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log for insert to authenticated
  with check (actor = auth.uid() and action in ('view','print','export','sign_in','sign_out') and public.mfa_ok());


-- #####################################################################################
-- 0004_clinic_settings_supplies.sql
-- #####################################################################################
-- First Bio Genetics LIMS: per-clinic settings, provider-restricted results,
-- collectors, supply orders, and optional two-step verification for clinic users.
-- Run once in the Supabase SQL editor after 0001-0003.

-- ---------- per-clinic settings (stored in clinics.data->'settings') ----------
--   ordering      clinic users may place orders in the portal (default off: the lab enters orders)
--   supplies      clinic users may order supplies (default off)
--   resultsScope  'all' (every clinic user sees every order) or 'provider' (users linked to providers see only theirs)
--   mfa           clinic users must use two-step verification (default on)
create or replace function public.clinic_flag(p_clinic text, p_key text, p_default boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (data->'settings'->>p_key)::boolean from clinics where id = p_clinic), p_default)
$$;
grant execute on function public.clinic_flag(text, text, boolean) to authenticated;

-- Two-step verification: always for lab staff; for clinic users unless their clinic turns it off.
create or replace function public.mfa_required() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select case when p.role = 'clinic' then public.clinic_flag(p.clinic_id, 'mfa', true) else true end
                   from profiles p where p.user_id = auth.uid()), true)
$$;
grant execute on function public.mfa_required() to authenticated;
create or replace function public.mfa_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt()->>'aal', '') = 'aal2' or not public.mfa_required()
$$;

-- ---------- users linked to providers ----------
alter table public.profiles add column if not exists provider_ids text[] not null default '{}';

-- A clinic user sees an order unless the clinic restricts results by provider and the user is linked
-- to specific providers who didn't order it. Users with no provider links (for example MAs) see all.
create or replace function public.clinic_order_visible(p_provider text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select case
      when coalesce(c.data->'settings'->>'resultsScope', 'all') = 'all' or cardinality(p.provider_ids) = 0 then true
      else p_provider = any(p.provider_ids) end
    from profiles p join clinics c on c.id = p.clinic_id where p.user_id = auth.uid() and p.role = 'clinic'), false)
$$;
grant execute on function public.clinic_order_visible(text) to authenticated;

drop policy if exists orders_read on public.orders;
drop policy if exists orders_update on public.orders;
create policy orders_read on public.orders for select to authenticated
  using (public.is_lab() or (clinic_id = public.my_clinic() and public.clinic_order_visible(data->>'providerId')));
create policy orders_update on public.orders for update to authenticated
  using (public.is_lab() or (clinic_id = public.my_clinic() and public.clinic_order_visible(data->>'providerId')))
  with check (public.is_lab() or clinic_id = public.my_clinic());

-- ---------- roles: add collector; supply permissions ----------
create or replace function public.role_perms(r text) returns text[]
language sql immutable as $$
  select case r
    when 'admin'     then array['*']
    when 'scientist' then array['clinics.view','orders.receive','instruments','sendouts','results.view','results.enter','results.release','alerts']
    when 'reporting' then array['clinics.view','orders.enter','orders.receive','sendouts','results.view','results.release','alerts','supplies']
    when 'sales'     then array['clinics.view','clinics.edit','orders.enter','supplies']
    when 'collector' then array['clinics.view','orders.enter','supplies']
    when 'billing'   then array['clinics.view','billing','billing.view','patients.edit']
    when 'auditor'   then array['clinics.view','results.view','billing.view','audit']
    else array[]::text[] end
$$;

-- ---------- clinic ordering is off unless the clinic's setting allows it ----------
create or replace function public.tg_orders_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_lab() then
    if tg_op = 'INSERT' then
      if exists (select 1 from orders where id = new.id) then return new; end if;
      if not public.has_perm('orders.enter') then raise exception 'Your role can''t enter orders'; end if;
      return new;
    end if;
    if (new.data->'results') is distinct from (old.data->'results') and not public.has_perm('results.enter') then
      raise exception 'Only scientists can enter or change results';
    end if;
    if (new.data->'verified') is distinct from (old.data->'verified') and not public.has_perm('results.enter') then
      raise exception 'Only scientists can verify results';
    end if;
    if (new.data->>'status') = 'Released' and (old.data->>'status') is distinct from 'Released' then
      if not public.has_perm('results.release') then raise exception 'Your role can''t release results'; end if;
      if not public.has_perm('results.enter') and (old.data->'verified') is null then
        raise exception 'A scientist must verify these results before they are reported';
      end if;
    elsif (old.data->>'status') = 'Released' and (new.data->>'status') is distinct from 'Released' then
      if not public.has_perm('results.enter') then raise exception 'Only scientists can reopen released results for correction'; end if;
    elsif (new.data->>'status') is distinct from (old.data->>'status') then
      if not (public.has_perm('orders.receive') or public.has_perm('results.enter')) then
        raise exception 'Your role can''t change specimen status';
      end if;
    end if;
    if ((new.data->'tests') is distinct from (old.data->'tests') or (new.data->'confirm') is distinct from (old.data->'confirm') or (new.data->'parts') is distinct from (old.data->'parts'))
       and not (public.has_perm('results.enter') or public.has_perm('orders.enter') or public.has_perm('results.release')) then
      raise exception 'Your role can''t change the tests on an order';
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    if exists (select 1 from orders where id = new.id) then return new; end if;
    if not public.clinic_flag(new.data->>'clinicId', 'ordering', false) then
      raise exception 'Online ordering is turned off for this clinic. Contact the lab.';
    end if;
    if coalesce(new.data->>'status','') <> 'Ordered' or coalesce(new.data->'results','{}'::jsonb) <> '{}'::jsonb then
      raise exception 'Clinics can only submit new orders';
    end if;
  elsif (new.data - 'readAt' - 'flags') is distinct from (old.data - 'readAt' - 'flags') then
    raise exception 'Orders cannot be changed after they are submitted';
  end if;
  return new;
end $$;

-- ---------- supply orders ----------
create table if not exists public.supply_orders (
  id text primary key, clinic_id text not null, data jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), updated_by uuid
);
create index if not exists supply_orders_clinic_idx on public.supply_orders (clinic_id);

create or replace function public.tg_stamp() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_table_name in ('patients','orders','supply_orders') then new.clinic_id := new.data->>'clinicId'; end if;
  if tg_table_name = 'notes' then new.aud := new.data->>'aud'; end if;
  return new;
end $$;
drop trigger if exists stamp on public.supply_orders;
create trigger stamp before insert or update on public.supply_orders for each row execute function public.tg_stamp();
drop trigger if exists audit on public.supply_orders;
create trigger audit after insert or update or delete on public.supply_orders for each row execute function public.tg_audit();

alter table public.supply_orders enable row level security;
create policy supply_read on public.supply_orders for select to authenticated
  using (public.is_lab() or clinic_id = public.my_clinic());
create policy supply_insert on public.supply_orders for insert to authenticated
  with check (public.has_perm('supplies') or (clinic_id = public.my_clinic() and public.clinic_flag(clinic_id, 'supplies', false)));
create policy supply_update on public.supply_orders for update to authenticated
  using (public.has_perm('supplies')) with check (public.has_perm('supplies'));
revoke delete on public.supply_orders from authenticated;

-- ---------- user management: provider links ----------
drop function if exists public.admin_save_profile(uuid, uuid, text, text[], text, text, text, boolean, boolean);
create or replace function public.admin_save_profile(p_actor uuid, p_user uuid, p_role text, p_lab_roles text[],
  p_clinic text, p_name text, p_email text, p_active boolean, p_must_change boolean, p_provider_ids text[] default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_actor::text, 'role', 'authenticated')::text, true);
  insert into profiles(user_id, role, lab_roles, clinic_id, name, email, active, must_change_pw, provider_ids)
  values (p_user, p_role, coalesce(p_lab_roles, '{}'), p_clinic, coalesce(p_name, ''), coalesce(p_email, ''), coalesce(p_active, true),
          coalesce(p_must_change, false), coalesce(p_provider_ids, '{}'))
  on conflict (user_id) do update set
    role = excluded.role, lab_roles = excluded.lab_roles, clinic_id = excluded.clinic_id,
    name = excluded.name, email = excluded.email, active = excluded.active,
    must_change_pw = coalesce(p_must_change, profiles.must_change_pw),
    provider_ids = coalesce(p_provider_ids, profiles.provider_ids);
end $$;
revoke execute on function public.admin_save_profile(uuid, uuid, text, text[], text, text, text, boolean, boolean, text[]) from public, anon, authenticated;


-- #####################################################################################
-- 0005_clinic_defaults.sql
-- #####################################################################################
-- First Bio Genetics LIMS: clinic defaults
-- Run once in the Supabase SQL editor after 0004.
--   * Two-step verification applies to lab staff only; clinic users sign in with a password.
--   * Clinics can place orders unless a clinic's "ordering" setting is turned off.

create or replace function public.mfa_required() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.role <> 'clinic' from profiles p where p.user_id = auth.uid()), true)
$$;

create or replace function public.tg_orders_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_lab() then
    if tg_op = 'INSERT' then
      if exists (select 1 from orders where id = new.id) then return new; end if;
      if not public.has_perm('orders.enter') then raise exception 'Your role can''t enter orders'; end if;
      return new;
    end if;
    if (new.data->'results') is distinct from (old.data->'results') and not public.has_perm('results.enter') then
      raise exception 'Only scientists can enter or change results';
    end if;
    if (new.data->'verified') is distinct from (old.data->'verified') and not public.has_perm('results.enter') then
      raise exception 'Only scientists can verify results';
    end if;
    if (new.data->>'status') = 'Released' and (old.data->>'status') is distinct from 'Released' then
      if not public.has_perm('results.release') then raise exception 'Your role can''t release results'; end if;
      if not public.has_perm('results.enter') and (old.data->'verified') is null then
        raise exception 'A scientist must verify these results before they are reported';
      end if;
    elsif (old.data->>'status') = 'Released' and (new.data->>'status') is distinct from 'Released' then
      if not public.has_perm('results.enter') then raise exception 'Only scientists can reopen released results for correction'; end if;
    elsif (new.data->>'status') is distinct from (old.data->>'status') then
      if not (public.has_perm('orders.receive') or public.has_perm('results.enter')) then
        raise exception 'Your role can''t change specimen status';
      end if;
    end if;
    if ((new.data->'tests') is distinct from (old.data->'tests') or (new.data->'confirm') is distinct from (old.data->'confirm') or (new.data->'parts') is distinct from (old.data->'parts'))
       and not (public.has_perm('results.enter') or public.has_perm('orders.enter') or public.has_perm('results.release')) then
      raise exception 'Your role can''t change the tests on an order';
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    if exists (select 1 from orders where id = new.id) then return new; end if;
    if not public.clinic_flag(new.data->>'clinicId', 'ordering', true) then
      raise exception 'Online ordering is turned off for this clinic. Contact the lab.';
    end if;
    if coalesce(new.data->>'status','') <> 'Ordered' or coalesce(new.data->'results','{}'::jsonb) <> '{}'::jsonb then
      raise exception 'Clinics can only submit new orders';
    end if;
  elsif (new.data - 'readAt' - 'flags') is distinct from (old.data - 'readAt' - 'flags') then
    raise exception 'Orders cannot be changed after they are submitted';
  end if;
  return new;
end $$;


-- #####################################################################################
-- 0006_qc.sql
-- #####################################################################################
-- First Bio Genetics LIMS: Quality Control (control materials, QC results, Levey-Jennings review)
-- Run once in the Supabase SQL editor after 0005.

create table if not exists public.qc_materials (
  id text primary key, data jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), updated_by uuid
);
create table if not exists public.qc_results (
  id text primary key, material_id text not null, at timestamptz not null, data jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), updated_by uuid
);
create index if not exists qc_results_material_idx on public.qc_results (material_id, at);
create index if not exists qc_results_at_idx on public.qc_results (at);

-- Scientists and admins record and review QC; all lab staff can view it.
create or replace function public.role_perms(r text) returns text[]
language sql immutable as $$
  select case r
    when 'admin'     then array['*']
    when 'scientist' then array['clinics.view','orders.receive','instruments','sendouts','results.view','results.enter','results.release','alerts','qc']
    when 'reporting' then array['clinics.view','orders.enter','orders.receive','sendouts','results.view','results.release','alerts','supplies']
    when 'sales'     then array['clinics.view','clinics.edit','orders.enter','supplies']
    when 'collector' then array['clinics.view','orders.enter','supplies']
    when 'billing'   then array['clinics.view','billing','billing.view','patients.edit']
    when 'auditor'   then array['clinics.view','results.view','billing.view','audit']
    else array[]::text[] end
$$;

do $$ declare t text; begin
  foreach t in array array['qc_materials','qc_results'] loop
    execute format('drop trigger if exists stamp on public.%I', t);
    execute format('create trigger stamp before insert or update on public.%I for each row execute function public.tg_stamp()', t);
    execute format('drop trigger if exists audit on public.%I', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.tg_audit()', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy qc_materials_read on public.qc_materials for select to authenticated using (public.is_lab());
create policy qc_materials_insert on public.qc_materials for insert to authenticated with check (public.has_perm('qc'));
create policy qc_materials_update on public.qc_materials for update to authenticated using (public.has_perm('qc')) with check (public.has_perm('qc'));
create policy qc_results_read on public.qc_results for select to authenticated using (public.is_lab());
create policy qc_results_insert on public.qc_results for insert to authenticated with check (public.has_perm('qc'));
create policy qc_results_update on public.qc_results for update to authenticated using (public.has_perm('qc')) with check (public.has_perm('qc'));
revoke delete on public.qc_materials, public.qc_results from authenticated;


-- #####################################################################################
-- 0007_compliance.sql
-- #####################################################################################
-- First Bio Genetics LIMS: compliance records, locked report versions, document storage
-- Run once in the Supabase SQL editor after 0006.

-- ---------- locked copies of every released report ----------
create table if not exists public.report_versions (
  id text primary key,
  order_id text not null,
  version int not null,
  data jsonb not null,
  released_at timestamptz not null default now(),
  released_by uuid default auth.uid(),
  unique (order_id, version)
);
alter table public.report_versions enable row level security;
create policy report_versions_read on public.report_versions for select to authenticated
  using (public.is_lab() or exists (select 1 from public.orders o where o.id = order_id
         and o.clinic_id = public.my_clinic() and public.clinic_order_visible(o.data->>'providerId')));
create policy report_versions_insert on public.report_versions for insert to authenticated
  with check (public.has_perm('results.release') and released_by = auth.uid());
create or replace function public.tg_immutable_report() returns trigger
language plpgsql as $$ begin raise exception 'Released reports cannot be changed or deleted. Issue a corrected report instead.'; end $$;
drop trigger if exists immutable on public.report_versions;
create trigger immutable before update or delete on public.report_versions for each row execute function public.tg_immutable_report();
revoke update, delete on public.report_versions from authenticated;

-- ---------- quality management records ----------
-- kinds: equipment, maintenance, temp, lot, run, pt, personnel, training, competency, sop, ack, capa, vendor, risk, access
create table if not exists public.qms_records (
  id text primary key, kind text not null, ref text, at timestamptz not null default now(), data jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), updated_by uuid
);
create index if not exists qms_kind_idx on public.qms_records (kind, at);
create index if not exists qms_ref_idx on public.qms_records (ref);

-- Roles: add "quality" (QA manager); scientists and admins keep their access.
create or replace function public.role_perms(r text) returns text[]
language sql immutable as $$
  select case r
    when 'admin'     then array['*']
    when 'scientist' then array['clinics.view','orders.receive','instruments','sendouts','results.view','results.enter','results.release','alerts','qc']
    when 'reporting' then array['clinics.view','orders.enter','orders.receive','sendouts','results.view','results.release','alerts','supplies']
    when 'sales'     then array['clinics.view','clinics.edit','orders.enter','supplies']
    when 'collector' then array['clinics.view','orders.enter','supplies']
    when 'billing'   then array['clinics.view','billing','billing.view','patients.edit']
    when 'quality'   then array['clinics.view','results.view','billing.view','audit','qc','qms']
    when 'auditor'   then array['clinics.view','results.view','billing.view','audit']
    else array[]::text[] end
$$;

drop trigger if exists stamp on public.qms_records;
create trigger stamp before insert or update on public.qms_records for each row execute function public.tg_stamp();
drop trigger if exists audit on public.qms_records;
create trigger audit after insert or update or delete on public.qms_records for each row execute function public.tg_audit();
alter table public.qms_records enable row level security;

-- Every lab user can read records and log the day-to-day ones (maintenance, temperatures,
-- read acknowledgments, instrument runs). Everything else needs the qms permission.
create policy qms_read on public.qms_records for select to authenticated using (public.is_lab());
create policy qms_insert on public.qms_records for insert to authenticated
  with check (public.is_lab() and (kind in ('maintenance','temp','ack','run') or public.has_perm('qms')));
create policy qms_update on public.qms_records for update to authenticated
  using (public.has_perm('qms')) with check (public.has_perm('qms'));
revoke delete on public.qms_records from authenticated;

-- ---------- private document storage (SOPs, certificates, PT reports, BAAs) ----------
insert into storage.buckets (id, name, public) values ('qms-docs', 'qms-docs', false) on conflict (id) do nothing;
drop policy if exists qms_docs_read on storage.objects;
drop policy if exists qms_docs_insert on storage.objects;
create policy qms_docs_read on storage.objects for select to authenticated using (bucket_id = 'qms-docs' and public.is_lab());
create policy qms_docs_insert on storage.objects for insert to authenticated with check (bucket_id = 'qms-docs' and public.is_lab());


-- #####################################################################################
-- 0008_instrument_inbox.sql
-- #####################################################################################
-- First Bio Genetics LIMS: instrument inbox (files uploaded automatically by the bridge on the lab PC)
-- Run once in the Supabase SQL editor after 0007.

create table if not exists public.instrument_devices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  token_hash text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  last_seen timestamptz
);
alter table public.instrument_devices enable row level security;
create policy devices_read on public.instrument_devices for select to authenticated using (public.is_lab());
create policy devices_insert on public.instrument_devices for insert to authenticated with check (public.has_perm('users'));
create policy devices_update on public.instrument_devices for update to authenticated using (public.has_perm('users')) with check (public.has_perm('users'));
revoke delete on public.instrument_devices from authenticated;

create table if not exists public.instrument_inbox (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references public.instrument_devices(id),
  instrument text not null,           -- 'c560' | 'sciex' | 'hl7'
  file_name text not null,
  size int not null default 0,
  content text not null,              -- base64
  received_at timestamptz not null default now(),
  status text not null default 'new', -- 'new' | 'imported' | 'dismissed'
  handled_at timestamptz,
  handled_by uuid,
  note text
);
create index if not exists instrument_inbox_status_idx on public.instrument_inbox (status, received_at);
alter table public.instrument_inbox enable row level security;
-- Files arrive only through the instrument-upload function (service role). Lab staff who import results can read and
-- mark them; nobody can delete them.
create policy inbox_read on public.instrument_inbox for select to authenticated using (public.has_perm('instruments') or public.has_perm('sendouts'));
create policy inbox_update on public.instrument_inbox for update to authenticated
  using (public.has_perm('instruments') or public.has_perm('sendouts')) with check (public.has_perm('instruments') or public.has_perm('sendouts'));
revoke insert, delete on public.instrument_inbox from authenticated;

drop trigger if exists audit on public.instrument_inbox;
create trigger audit after update on public.instrument_inbox for each row execute function public.tg_audit();
drop trigger if exists audit on public.instrument_devices;
create trigger audit after insert or update on public.instrument_devices for each row execute function public.tg_audit();


-- #####################################################################################
-- 0009_pickups_invoices.sql
-- #####################################################################################
-- First Bio Genetics LIMS: courier pickups, client invoices, report and pickup permissions
-- Run once in the Supabase SQL editor after 0008.

create or replace function public.role_perms(r text) returns text[]
language sql immutable as $$
  select case r
    when 'admin'     then array['*']
    when 'scientist' then array['clinics.view','orders.receive','instruments','sendouts','results.view','results.enter','results.release','alerts','qc','pickups']
    when 'reporting' then array['clinics.view','orders.enter','orders.receive','sendouts','results.view','results.release','alerts','supplies','pickups']
    when 'sales'     then array['clinics.view','clinics.edit','orders.enter','supplies','reports']
    when 'collector' then array['clinics.view','orders.enter','supplies','pickups']
    when 'billing'   then array['clinics.view','billing','billing.view','patients.edit','reports']
    when 'quality'   then array['clinics.view','results.view','billing.view','audit','qc','qms','reports']
    when 'auditor'   then array['clinics.view','results.view','billing.view','audit','reports']
    else array[]::text[] end
$$;

create table if not exists public.pickups (
  id text primary key, clinic_id text not null, data jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), updated_by uuid
);
create table if not exists public.invoices (
  id text primary key, clinic_id text not null, data jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), updated_by uuid
);
create index if not exists pickups_clinic_idx on public.pickups (clinic_id);
create index if not exists invoices_clinic_idx on public.invoices (clinic_id);

create or replace function public.tg_stamp() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_table_name in ('patients','orders','supply_orders','pickups','invoices') then new.clinic_id := new.data->>'clinicId'; end if;
  if tg_table_name = 'notes' then new.aud := new.data->>'aud'; end if;
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['pickups','invoices'] loop
    execute format('drop trigger if exists stamp on public.%I', t);
    execute format('create trigger stamp before insert or update on public.%I for each row execute function public.tg_stamp()', t);
    execute format('drop trigger if exists audit on public.%I', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.tg_audit()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke delete on public.%I from authenticated', t);
  end loop;
end $$;

-- Pickups: clinics request and see their own; lab staff with the pickups permission dispatch and update.
create policy pickups_read on public.pickups for select to authenticated using (public.is_lab() or clinic_id = public.my_clinic());
create policy pickups_insert on public.pickups for insert to authenticated
  with check (public.has_perm('pickups') or (clinic_id = public.my_clinic() and data->>'status' = 'Requested'));
create policy pickups_update on public.pickups for update to authenticated
  using (public.has_perm('pickups') or (clinic_id = public.my_clinic() and data->>'status' = 'Requested'))
  with check (public.has_perm('pickups') or (clinic_id = public.my_clinic() and data->>'status' in ('Requested','Cancelled')));

-- Invoices: billing staff create and update; clinics can see their own.
create policy invoices_read on public.invoices for select to authenticated
  using (public.has_perm('billing.view') or public.has_perm('billing') or clinic_id = public.my_clinic());
create policy invoices_insert on public.invoices for insert to authenticated with check (public.has_perm('billing'));
create policy invoices_update on public.invoices for update to authenticated using (public.has_perm('billing')) with check (public.has_perm('billing'));


-- #####################################################################################
-- 0010_patient_portal.sql
-- #####################################################################################
-- First Bio Genetics LIMS: patient portal (patients view their own released reports)
-- Run once in the Supabase SQL editor after 0009.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('lab','clinic','patient'));
alter table public.profiles add column if not exists patient_ids text[] not null default '{}';

-- Two-step verification applies to lab staff only.
create or replace function public.mfa_required() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.role not in ('clinic','patient') from profiles p where p.user_id = auth.uid()), true)
$$;

create or replace function public.my_patients() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce((select patient_ids from profiles where user_id = auth.uid() and role = 'patient' and active), '{}')
$$;
grant execute on function public.my_patients() to authenticated;

-- Hours after release before a report appears in the patient portal (Lab settings > Patient portal).
create or replace function public.patient_delay_hours() returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(data->>'patientDelayHours','')::numeric from settings where key = 'lab'), 0)
$$;

create or replace function public.patient_can_see(p_order text, p_released timestamptz) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (data->>'patientId') = any(public.my_patients()) and coalesce((data->>'patientPortal')::boolean, true)
                     from orders where id = p_order), false)
     and p_released <= now() - make_interval(secs => public.patient_delay_hours() * 3600)
$$;
grant execute on function public.patient_can_see(text, timestamptz) to authenticated;

create policy report_versions_patient on public.report_versions for select to authenticated
  using (public.patient_can_see(order_id, released_at));


-- #####################################################################################
-- 0011_scale.sql
-- #####################################################################################
-- First Bio Genetics LIMS: scale to years of data
-- The portal loads only recent and active records at sign-in, then fetches changes and older records on demand.
-- All functions run as the signed-in user (security invoker), so Row Level Security still decides what each user sees.
-- Run once in the Supabase SQL editor after 0010.

create extension if not exists pg_trgm;

create index if not exists orders_updated_idx   on public.orders (updated_at);
create index if not exists orders_status_idx    on public.orders ((data->>'status'));
create index if not exists orders_patient_idx   on public.orders ((data->>'patientId'));
create index if not exists orders_accession_idx on public.orders ((data->>'accession'));
create index if not exists orders_collected_idx on public.orders (((data->>'collectedAt')::bigint));
create index if not exists orders_access_code_idx on public.orders ((data->>'accessCode'));
create index if not exists patients_updated_idx on public.patients (updated_at);
create index if not exists patients_last_trgm   on public.patients using gin (lower(data->>'last') gin_trgm_ops);
create index if not exists patients_first_trgm  on public.patients using gin (lower(data->>'first') gin_trgm_ops);
create index if not exists notes_updated_idx    on public.notes (updated_at);
create index if not exists claims_updated_idx   on public.claims (updated_at);
create index if not exists outbox_updated_idx   on public.outbox (updated_at);

create or replace function public.server_now() returns timestamptz language sql stable as $$ select now() $$;
grant execute on function public.server_now() to authenticated;

-- Records loaded at sign-in.
create or replace function public.doc_window(p_table text, p_days int)
returns table(id text, data jsonb, updated_at timestamptz)
language plpgsql stable security invoker set search_path = public as $$
declare since timestamptz := now() - make_interval(days => greatest(p_days, 1));
begin
  if p_table = 'orders' then
    return query select o.id, o.data, o.updated_at from orders o
      where o.updated_at >= since or o.data->>'status' in ('Ordered','Received','In Process')
         or (o.data ? 'storage' and (o.data->'storage'->>'disposedAt') is null);
  elsif p_table = 'patients' then
    return query select p.id, p.data, p.updated_at from patients p
      where p.updated_at >= since or exists (select 1 from orders o where o.data->>'patientId' = p.id
        and (o.updated_at >= since or o.data->>'status' in ('Ordered','Received','In Process')));
  elsif p_table = 'notes' then
    return query select n.id, n.data, n.updated_at from notes n where n.updated_at >= since;
  elsif p_table = 'claims' then
    return query select c.id, c.data, c.updated_at from claims c where c.updated_at >= since or coalesce(c.data->>'status','') <> 'Sent';
  elsif p_table = 'outbox' then
    return query select x.id, x.data, x.updated_at from outbox x where x.updated_at >= since or coalesce(x.data->>'status','') <> 'Sent';
  elsif p_table = 'invoices' then
    return query select i.id, i.data, i.updated_at from invoices i where i.updated_at >= since or coalesce(i.data->>'status','') <> 'Paid';
  elsif p_table = 'pickups' then
    return query select k.id, k.data, k.updated_at from pickups k where k.updated_at >= since or coalesce(k.data->>'status','') not in ('Delivered','Cancelled');
  elsif p_table = 'supply_orders' then
    return query select s.id, s.data, s.updated_at from supply_orders s where s.updated_at >= since or coalesce(s.data->>'status','') = 'New';
  else
    raise exception 'doc_window: unsupported table %', p_table;
  end if;
end $$;

-- Records changed since the last check (used every 30 seconds).
create or replace function public.changes_since(p_table text, p_since timestamptz)
returns table(id text, data jsonb, updated_at timestamptz)
language plpgsql stable security invoker set search_path = public as $$
begin
  if p_table not in ('clinics','patients','orders','notes','claims','outbox','supply_orders','pickups','invoices') then
    raise exception 'changes_since: unsupported table %', p_table;
  end if;
  return query execute format('select id, data, updated_at from public.%I where updated_at > $1 order by updated_at limit 2000', p_table) using p_since;
end $$;

-- On-demand lookups.
create or replace function public.search_orders(p_q text)
returns table(id text, data jsonb, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select o.id, o.data, o.updated_at from orders o
  where o.data->>'accession' ilike '%' || p_q || '%'
     or o.data->>'patientId' in (select p.id from patients p where lower(p.data->>'last') like '%' || lower(p_q) || '%' or lower(p.data->>'first') like '%' || lower(p_q) || '%' or p.data->>'mrn' ilike p_q || '%')
  order by o.updated_at desc limit 200
$$;
create or replace function public.search_patients(p_q text)
returns table(id text, data jsonb, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select p.id, p.data, p.updated_at from patients p
  where lower(p.data->>'last') like '%' || lower(p_q) || '%' or lower(p.data->>'first') like '%' || lower(p_q) || '%'
     or p.data->>'mrn' ilike p_q || '%' or p.data->>'dob' = p_q or lower((p.data->'ins'->>'member')) = lower(p_q)
  order by p.updated_at desc limit 200
$$;
create or replace function public.patient_orders(p_patient text)
returns table(id text, data jsonb, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select o.id, o.data, o.updated_at from orders o where o.data->>'patientId' = p_patient order by o.updated_at desc limit 500
$$;
create or replace function public.orders_by_ids(p_ids text[])
returns table(id text, data jsonb, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$ select o.id, o.data, o.updated_at from orders o where o.id = any(p_ids) $$;
create or replace function public.patients_by_ids(p_ids text[])
returns table(id text, data jsonb, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$ select p.id, p.data, p.updated_at from patients p where p.id = any(p_ids) $$;
create or replace function public.orders_before(p_before bigint, p_limit int)
returns table(id text, data jsonb, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select o.id, o.data, o.updated_at from orders o where (o.data->>'collectedAt')::bigint < p_before
  order by (o.data->>'collectedAt')::bigint desc limit least(greatest(p_limit, 1), 500)
$$;
create or replace function public.client_bill_orders(p_from bigint, p_to bigint)
returns table(id text, data jsonb, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select o.id, o.data, o.updated_at from orders o
  where o.data->>'billType' = 'Client bill' and o.data->>'status' = 'Released'
    and (o.data->>'collectedAt')::bigint >= p_from and (o.data->>'collectedAt')::bigint < p_to
$$;

-- Compact per-order facts for reports and quality indicators (no results, no patient details).
create or replace function public.order_facts(p_from bigint, p_clinic text default null)
returns table(id text, clinic_id text, patient_id text, created_at timestamptz, status text, tests jsonb, bill_type text,
              collected_at bigint, released_at bigint, received_at bigint, reject_reason text, corrections int, summary jsonb)
language sql stable security invoker set search_path = public as $$
  select o.id, o.clinic_id, o.data->>'patientId', o.created_at, o.data->>'status', o.data->'tests', o.data->>'billType',
         (o.data->>'collectedAt')::bigint, nullif(o.data->>'releasedAt','')::bigint,
         (select (h->>'at')::bigint from jsonb_array_elements(coalesce(o.data->'history','[]'::jsonb)) h where h->>'s' = 'Received' limit 1),
         o.data->>'rejectReason', coalesce(jsonb_array_length(case when jsonb_typeof(o.data->'corrections') = 'array' then o.data->'corrections' end), 0),
         o.data->'summary'
  from orders o
  where o.created_at >= to_timestamp(p_from / 1000.0) and (p_clinic is null or o.clinic_id = p_clinic)
$$;
create or replace function public.claims_since(p_from bigint)
returns table(id text, data jsonb, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$ select c.id, c.data, c.updated_at from claims c where c.created_at >= to_timestamp(p_from / 1000.0) $$;
create or replace function public.patient_facts()
returns table(id text, clinic_id text, first text, last text, dob text, merged text)
language sql stable security invoker set search_path = public as $$
  select p.id, p.clinic_id, p.data->>'first', p.data->>'last', p.data->>'dob', p.data->>'mergedInto' from patients p
$$;
-- Released orders that don't have report statistics yet (filled in by Reports > Rebuild statistics).
create or replace function public.orders_missing_summary(p_limit int)
returns table(id text, data jsonb, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select o.id, o.data, o.updated_at from orders o where o.data->>'status' = 'Released' and not (o.data ? 'summary') limit least(greatest(p_limit,1), 200)
$$;

grant execute on function public.doc_window(text,int), public.changes_since(text,timestamptz), public.search_orders(text), public.search_patients(text),
  public.patient_orders(text), public.orders_by_ids(text[]), public.patients_by_ids(text[]), public.orders_before(bigint,int),
  public.client_bill_orders(bigint,bigint), public.order_facts(bigint,text), public.claims_since(bigint), public.patient_facts(),
  public.orders_missing_summary(int) to authenticated;
