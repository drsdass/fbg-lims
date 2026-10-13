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
