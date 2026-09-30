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
