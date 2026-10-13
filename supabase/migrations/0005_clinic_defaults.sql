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
