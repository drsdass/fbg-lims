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
