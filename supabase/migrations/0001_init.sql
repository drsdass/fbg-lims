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
