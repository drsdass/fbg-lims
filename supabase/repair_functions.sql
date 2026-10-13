-- First Bio Genetics LIMS: re-apply the current version of every database function.
-- Use only if the check query shows an older function version (for example after running setup_production.sql
-- on a project that was already set up). Safe to run more than once. Only the newest definition of each function
-- is included, so functions that later migrations removed are not brought back, and existing permissions are kept.

-- mfa_ok, from 0004_clinic_settings_supplies.sql
create or replace function public.mfa_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt()->>'aal', '') = 'aal2' or not public.mfa_required()
$$;

-- is_lab, from 0003_roles.sql
create or replace function public.is_lab() returns boolean
language sql stable security definer set search_path = public as $$
  select public.mfa_ok() and exists (select 1 from profiles where user_id = auth.uid() and role = 'lab' and active and cardinality(lab_roles) > 0)
$$;

-- my_clinic, from 0003_roles.sql
create or replace function public.my_clinic() returns text
language sql stable security definer set search_path = public as $$
  select case when public.mfa_ok()
    then (select clinic_id from profiles where user_id = auth.uid() and role = 'clinic' and active) end
$$;

-- next_seq_internal, from 0001_init.sql
create or replace function public.next_seq_internal(p_name text) returns bigint
language sql security definer set search_path = public as $$
  insert into seqs(name, value) values (p_name, 1001)
  on conflict (name) do update set value = seqs.value + 1
  returning value
$$;

-- next_seq, from 0001_init.sql
create or replace function public.next_seq(p_name text) returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if p_name not in ('accession') then raise exception 'Unknown sequence'; end if;
  if not (public.is_lab() or public.my_clinic() is not null) then raise exception 'Not authorized'; end if;
  return public.next_seq_internal(p_name);
end $$;

-- tg_stamp, from 0009_pickups_invoices.sql
create or replace function public.tg_stamp() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_table_name in ('patients','orders','supply_orders','pickups','invoices') then new.clinic_id := new.data->>'clinicId'; end if;
  if tg_table_name = 'notes' then new.aud := new.data->>'aud'; end if;
  return new;
end $$;

-- tg_orders_guard, from 0005_clinic_defaults.sql
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

-- tg_clinics_guard, from 0003_roles.sql
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

-- tg_audit, from 0002_audit.sql
create or replace function public.tg_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare r jsonb; o jsonb; v_id text; v_detail jsonb; v_changed text[];
begin
  if tg_op <> 'DELETE' then r := to_jsonb(new); end if;
  if tg_op <> 'INSERT' then o := to_jsonb(old); end if;
  v_id := coalesce(r->>'id', r->>'key', r->>'user_id', o->>'id', o->>'key', o->>'user_id');

  if tg_table_name = 'profiles' then
    v_detail := jsonb_build_object('role', coalesce(r->>'role', o->>'role'),
                                   'clinic', coalesce(r->>'clinic_id', o->>'clinic_id'),
                                   'email', coalesce(r->>'email', o->>'email'));
    if tg_op = 'UPDATE' then
      v_detail := v_detail || jsonb_build_object('previousRole', o->>'role', 'previousClinic', o->>'clinic_id');
    end if;
  elsif tg_op = 'UPDATE' then
    select coalesce(array_agg(k order by k), '{}') into v_changed
    from (select jsonb_object_keys(coalesce(o->'data', '{}'::jsonb) || coalesce(r->'data', '{}'::jsonb)) as k) x
    where (o->'data'->k) is distinct from (r->'data'->k);
    if coalesce(array_length(v_changed, 1), 0) = 0 then return null; end if;  -- nothing actually changed
    v_detail := jsonb_build_object('changed', to_jsonb(v_changed));
    if (o->'data'->>'status') is distinct from (r->'data'->>'status') then
      v_detail := v_detail || jsonb_build_object('status', jsonb_build_array(o->'data'->>'status', r->'data'->>'status'));
    end if;
  end if;

  insert into audit_log(actor, action, tbl, row_id, detail)
  values (auth.uid(), lower(tg_op), tg_table_name, v_id, v_detail);
  return null;
end $$;

-- register_clinic, from 0001_init.sql
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

-- tg_audit_immutable, from 0002_audit.sql
create or replace function public.tg_audit_immutable() returns trigger
language plpgsql as $$ begin raise exception 'The audit log cannot be changed or deleted'; end $$;

-- role_perms, from 0009_pickups_invoices.sql
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

-- has_perm, from 0003_roles.sql
create or replace function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.mfa_ok() and exists (
    select 1 from profiles pr, unnest(pr.lab_roles) r
    where pr.user_id = auth.uid() and pr.role = 'lab' and pr.active
      and public.role_perms(r) && array['*', p])
$$;

-- create_clinic, from 0003_roles.sql
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

-- admin_save_profile, from 0004_clinic_settings_supplies.sql
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

-- password_changed, from 0003_roles.sql
create or replace function public.password_changed() returns void
language sql security definer set search_path = public as $$
  update profiles set must_change_pw = false where user_id = auth.uid()
$$;

-- clinic_flag, from 0004_clinic_settings_supplies.sql
create or replace function public.clinic_flag(p_clinic text, p_key text, p_default boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (data->'settings'->>p_key)::boolean from clinics where id = p_clinic), p_default)
$$;

-- mfa_required, from 0010_patient_portal.sql
create or replace function public.mfa_required() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.role not in ('clinic','patient') from profiles p where p.user_id = auth.uid()), true)
$$;

-- clinic_order_visible, from 0004_clinic_settings_supplies.sql
create or replace function public.clinic_order_visible(p_provider text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select case
      when coalesce(c.data->'settings'->>'resultsScope', 'all') = 'all' or cardinality(p.provider_ids) = 0 then true
      else p_provider = any(p.provider_ids) end
    from profiles p join clinics c on c.id = p.clinic_id where p.user_id = auth.uid() and p.role = 'clinic'), false)
$$;

-- tg_immutable_report, from 0007_compliance.sql
create or replace function public.tg_immutable_report() returns trigger
language plpgsql as $$ begin raise exception 'Released reports cannot be changed or deleted. Issue a corrected report instead.'; end $$;

-- my_patients, from 0010_patient_portal.sql
create or replace function public.my_patients() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce((select patient_ids from profiles where user_id = auth.uid() and role = 'patient' and active), '{}')
$$;

-- patient_delay_hours, from 0010_patient_portal.sql
create or replace function public.patient_delay_hours() returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(data->>'patientDelayHours','')::numeric from settings where key = 'lab'), 0)
$$;

-- patient_can_see, from 0010_patient_portal.sql
create or replace function public.patient_can_see(p_order text, p_released timestamptz) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (data->>'patientId') = any(public.my_patients()) and coalesce((data->>'patientPortal')::boolean, true)
                     from orders where id = p_order), false)
     and p_released <= now() - make_interval(secs => public.patient_delay_hours() * 3600)
$$;

-- server_now, from 0011_scale.sql
create or replace function public.server_now() returns timestamptz language sql stable as $$ select now() $$;

-- doc_window, from 0011_scale.sql
create or replace function public.doc_window(p_table text, p_days int)
returns table(id text, data jsonb, updated_at timestamptz)
language plpgsql stable security invoker set search_path = public as $$
declare since timestamptz := now() - make_interval(days => greatest(p_days, 1));
begin
  if p_table = 'orders' then
    return query select o.id, o.data, o.updated_at from orders o
      where o.updated_at >= since or o.data->>'status' in ('Ordered','Received','In Process')
         or (o.data ? 'storage' and (o.data->'storage'->>'disposedAt') is null);
  elsif p_table = 'patients' then
    return query select p.id, p.data, p.updated_at from patients p
      where p.updated_at >= since or exists (select 1 from orders o where o.data->>'patientId' = p.id
        and (o.updated_at >= since or o.data->>'status' in ('Ordered','Received','In Process')));
  elsif p_table = 'notes' then
    return query select n.id, n.data, n.updated_at from notes n where n.updated_at >= since;
  elsif p_table = 'claims' then
    return query select c.id, c.data, c.updated_at from claims c where c.updated_at >= since or coalesce(c.data->>'status','') <> 'Sent';
  elsif p_table = 'outbox' then
    return query select x.id, x.data, x.updated_at from outbox x where x.updated_at >= since or coalesce(x.data->>'status','') <> 'Sent';
  elsif p_table = 'invoices' then
    return query select i.id, i.data, i.updated_at from invoices i where i.updated_at >= since or coalesce(i.data->>'status','') <> 'Paid';
  elsif p_table = 'pickups' then
    return query select k.id, k.data, k.updated_at from pickups k where k.updated_at >= since or coalesce(k.data->>'status','') not in ('Delivered','Cancelled');
  elsif p_table = 'supply_orders' then
    return query select s.id, s.data, s.updated_at from supply_orders s where s.updated_at >= since or coalesce(s.data->>'status','') = 'New';
  else
    raise exception 'doc_window: unsupported table %', p_table;
  end if;
end $$;

-- changes_since, from 0011_scale.sql
create or replace function public.changes_since(p_table text, p_since timestamptz)
returns table(id text, data jsonb, updated_at timestamptz)
language plpgsql stable security invoker set search_path = public as $$
begin
  if p_table not in ('clinics','patients','orders','notes','claims','outbox','supply_orders','pickups','invoices') then
    raise exception 'changes_since: unsupported table %', p_table;
  end if;
  return query execute format('select id, data, updated_at from public.%I where updated_at > $1 order by updated_at limit 2000', p_table) using p_since;
end $$;

-- search_orders, from 0011_scale.sql
create or replace function public.search_orders(p_q text)
returns table(id text, data jsonb, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select o.id, o.data, o.updated_at from orders o
  where o.data->>'accession' ilike '%' || p_q || '%'
     or o.data->>'patientId' in (select p.id from patients p where lower(p.data->>'last') like '%' || lower(p_q) || '%' or lower(p.data->>'first') like '%' || lower(p_q) || '%' or p.data->>'mrn' ilike p_q || '%')
  order by o.updated_at desc limit 200
$$;

-- search_patients, from 0011_scale.sql
create or replace function public.search_patients(p_q text)
returns table(id text, data jsonb, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select p.id, p.data, p.updated_at from patients p
  where lower(p.data->>'last') like '%' || lower(p_q) || '%' or lower(p.data->>'first') like '%' || lower(p_q) || '%'
     or p.data->>'mrn' ilike p_q || '%' or p.data->>'dob' = p_q or lower((p.data->'ins'->>'member')) = lower(p_q)
  order by p.updated_at desc limit 200
$$;

-- patient_orders, from 0011_scale.sql
create or replace function public.patient_orders(p_patient text)
returns table(id text, data jsonb, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select o.id, o.data, o.updated_at from orders o where o.data->>'patientId' = p_patient order by o.updated_at desc limit 500
$$;

-- orders_by_ids, from 0011_scale.sql
create or replace function public.orders_by_ids(p_ids text[])
returns table(id text, data jsonb, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$ select o.id, o.data, o.updated_at from orders o where o.id = any(p_ids) $$;

-- patients_by_ids, from 0011_scale.sql
create or replace function public.patients_by_ids(p_ids text[])
returns table(id text, data jsonb, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$ select p.id, p.data, p.updated_at from patients p where p.id = any(p_ids) $$;

-- orders_before, from 0011_scale.sql
create or replace function public.orders_before(p_before bigint, p_limit int)
returns table(id text, data jsonb, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select o.id, o.data, o.updated_at from orders o where (o.data->>'collectedAt')::bigint < p_before
  order by (o.data->>'collectedAt')::bigint desc limit least(greatest(p_limit, 1), 500)
$$;

-- client_bill_orders, from 0011_scale.sql
create or replace function public.client_bill_orders(p_from bigint, p_to bigint)
returns table(id text, data jsonb, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select o.id, o.data, o.updated_at from orders o
  where o.data->>'billType' = 'Client bill' and o.data->>'status' = 'Released'
    and (o.data->>'collectedAt')::bigint >= p_from and (o.data->>'collectedAt')::bigint < p_to
$$;

-- order_facts, from 0011_scale.sql
create or replace function public.order_facts(p_from bigint, p_clinic text default null)
returns table(id text, clinic_id text, patient_id text, created_at timestamptz, status text, tests jsonb, bill_type text,
              collected_at bigint, released_at bigint, received_at bigint, reject_reason text, corrections int, summary jsonb)
language sql stable security invoker set search_path = public as $$
  select o.id, o.clinic_id, o.data->>'patientId', o.created_at, o.data->>'status', o.data->'tests', o.data->>'billType',
         (o.data->>'collectedAt')::bigint, nullif(o.data->>'releasedAt','')::bigint,
         (select (h->>'at')::bigint from jsonb_array_elements(coalesce(o.data->'history','[]'::jsonb)) h where h->>'s' = 'Received' limit 1),
         o.data->>'rejectReason', coalesce(jsonb_array_length(case when jsonb_typeof(o.data->'corrections') = 'array' then o.data->'corrections' end), 0),
         o.data->'summary'
  from orders o
  where o.created_at >= to_timestamp(p_from / 1000.0) and (p_clinic is null or o.clinic_id = p_clinic)
$$;

-- claims_since, from 0011_scale.sql
create or replace function public.claims_since(p_from bigint)
returns table(id text, data jsonb, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$ select c.id, c.data, c.updated_at from claims c where c.created_at >= to_timestamp(p_from / 1000.0) $$;

-- patient_facts, from 0011_scale.sql
create or replace function public.patient_facts()
returns table(id text, clinic_id text, first text, last text, dob text, merged text)
language sql stable security invoker set search_path = public as $$
  select p.id, p.clinic_id, p.data->>'first', p.data->>'last', p.data->>'dob', p.data->>'mergedInto' from patients p
$$;

-- orders_missing_summary, from 0011_scale.sql
create or replace function public.orders_missing_summary(p_limit int)
returns table(id text, data jsonb, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select o.id, o.data, o.updated_at from orders o where o.data->>'status' = 'Released' and not (o.data ? 'summary') limit least(greatest(p_limit,1), 200)
$$;
