-- First Bio Genetics LIMS: archive or delete clinics, clinic two-step verification off by default, and clinic portal
-- settings controlled by the lab only.
-- Run once in the Supabase SQL editor after 0012.

-- 1. Users of an archived clinic lose access to its data (their accounts are untouched, so restoring the clinic
--    restores their access).
create or replace function public.my_clinic() returns text
language sql stable security definer set search_path = public as $$
  select case when public.mfa_ok()
    then (select p.clinic_id from profiles p
          where p.user_id = auth.uid() and p.role = 'clinic' and p.active
            and not exists (select 1 from clinics c where c.id = p.clinic_id and c.data->>'status' = 'archived')) end
$$;

-- 2. Only the lab can change a clinic's status, account number or portal settings (ordering, supplies, who sees
--    results, two-step verification). Clinic users can still edit their own contact details and providers.
create or replace function public.tg_clinics_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_lab() or current_setting('fbg.registering', true) = '1' then return new; end if;
  if tg_op = 'INSERT' then raise exception 'Clinics are created through registration'; end if;
  if new.data->'status' is distinct from old.data->'status'
     or new.data->'acct' is distinct from old.data->'acct'
     or new.data->'settings' is distinct from old.data->'settings'
     or new.id is distinct from old.id then
    raise exception 'Only the lab can change clinic status, account number or portal settings';
  end if;
  return new;
end $$;

-- 3. Permanent delete, for test or duplicate profiles only: an admin can delete a clinic that has no patients,
--    no orders and no portal users. Anything with records must be archived instead, so nothing clinical is lost.
drop policy if exists clinics_delete on public.clinics;
create policy clinics_delete on public.clinics for delete to authenticated using (
  public.has_perm('clinics.approve')
  and not exists (select 1 from public.orders o where o.clinic_id = clinics.id)
  and not exists (select 1 from public.patients p where p.clinic_id = clinics.id)
  and not exists (select 1 from public.profiles u where u.clinic_id = clinics.id)
);
grant delete on public.clinics to authenticated;

-- How many patients, orders and portal users a clinic has (for the archive/delete screen).
create or replace function public.clinic_usage(p_clinic text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_lab() then jsonb_build_object(
    'patients', (select count(*) from patients where clinic_id = p_clinic),
    'orders',   (select count(*) from orders where clinic_id = p_clinic),
    'users',    (select count(*) from profiles where clinic_id = p_clinic)) end
$$;
grant execute on function public.clinic_usage(text) to authenticated;

-- 4. Two-step verification: always required for lab staff, never for patients. For clinic users it is off unless the
--    lab turns it on for that clinic (Clinics > Edit > "Require two-step verification for this clinic's users").
create or replace function public.mfa_required() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select case p.role when 'patient' then false
                                       when 'clinic' then public.clinic_flag(p.clinic_id, 'mfa', false)
                                       else true end
                   from profiles p where p.user_id = auth.uid()), true)
$$;
