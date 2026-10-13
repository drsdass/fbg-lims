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
