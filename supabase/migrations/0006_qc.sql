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
