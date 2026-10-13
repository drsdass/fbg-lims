-- 0016: insurance checks (plan-type screening of a clinic's patients before the lab takes the clinic on).
-- Each saved check holds the patient list the lab typed, pasted or uploaded and the result for each plan.
-- Card photos are never stored, only the text read from them. Lab staff who work with clinics or billing can use them.
create table if not exists public.insurance_checks (
  id text primary key, at timestamptz not null default now(), data jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), updated_by uuid
);
create index if not exists insurance_checks_at_idx on public.insurance_checks (at desc);
drop trigger if exists stamp on public.insurance_checks;
create trigger stamp before insert or update on public.insurance_checks for each row execute function public.tg_stamp();
drop trigger if exists audit on public.insurance_checks;
create trigger audit after insert or update or delete on public.insurance_checks for each row execute function public.tg_audit();
alter table public.insurance_checks enable row level security;
drop policy if exists inschk_read on public.insurance_checks;
drop policy if exists inschk_insert on public.insurance_checks;
drop policy if exists inschk_update on public.insurance_checks;
drop policy if exists inschk_delete on public.insurance_checks;
create policy inschk_read on public.insurance_checks for select to authenticated
  using (public.is_lab() and (public.has_perm('clinics.view') or public.has_perm('billing') or public.has_perm('billing.view')));
create policy inschk_insert on public.insurance_checks for insert to authenticated
  with check (public.is_lab() and (public.has_perm('clinics.view') or public.has_perm('billing')));
create policy inschk_update on public.insurance_checks for update to authenticated
  using (public.is_lab() and (public.has_perm('clinics.view') or public.has_perm('billing')))
  with check (public.is_lab() and (public.has_perm('clinics.view') or public.has_perm('billing')));
create policy inschk_delete on public.insurance_checks for delete to authenticated
  using (public.is_lab() and (public.has_perm('clinics.edit') or public.has_perm('billing')));
