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
