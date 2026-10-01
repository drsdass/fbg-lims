-- First Bio Genetics LIMS: scale to years of data
-- The portal loads only recent and active records at sign-in, then fetches changes and older records on demand.
-- All functions run as the signed-in user (security invoker), so Row Level Security still decides what each user sees.
-- Run once in the Supabase SQL editor after 0010.

create extension if not exists pg_trgm;

create index if not exists orders_updated_idx   on public.orders (updated_at);
create index if not exists orders_status_idx    on public.orders ((data->>'status'));
create index if not exists orders_patient_idx   on public.orders ((data->>'patientId'));
create index if not exists orders_accession_idx on public.orders ((data->>'accession'));
create index if not exists orders_collected_idx on public.orders (((data->>'collectedAt')::bigint));
create index if not exists orders_access_code_idx on public.orders ((data->>'accessCode'));
create index if not exists patients_updated_idx on public.patients (updated_at);
create index if not exists patients_last_trgm   on public.patients using gin (lower(data->>'last') gin_trgm_ops);
create index if not exists patients_first_trgm  on public.patients using gin (lower(data->>'first') gin_trgm_ops);
create index if not exists notes_updated_idx    on public.notes (updated_at);
create index if not exists claims_updated_idx   on public.claims (updated_at);
create index if not exists outbox_updated_idx   on public.outbox (updated_at);

create or replace function public.server_now() returns timestamptz language sql stable as $$ select now() $$;
grant execute on function public.server_now() to authenticated;

-- Records loaded at sign-in.
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

-- Records changed since the last check (used every 30 seconds).
create or replace function public.changes_since(p_table text, p_since timestamptz)
returns table(id text, data jsonb, updated_at timestamptz)
language plpgsql stable security invoker set search_path = public as $$
begin
  if p_table not in ('clinics','patients','orders','notes','claims','outbox','supply_orders','pickups','invoices') then
    raise exception 'changes_since: unsupported table %', p_table;
  end if;
  return query execute format('select id, data, updated_at from public.%I where updated_at > $1 order by updated_at limit 2000', p_table) using p_since;
end $$;

-- On-demand lookups.
create or replace function public.search_orders(p_q text)
returns table(id text, data jsonb, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select o.id, o.data, o.updated_at from orders o
  where o.data->>'accession' ilike '%' || p_q || '%'
     or o.data->>'patientId' in (select p.id from patients p where lower(p.data->>'last') like '%' || lower(p_q) || '%' or lower(p.data->>'first') like '%' || lower(p_q) || '%' or p.data->>'mrn' ilike p_q || '%')
  order by o.updated_at desc limit 200
$$;
create or replace function public.search_patients(p_q text)
returns table(id text, data jsonb, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select p.id, p.data, p.updated_at from patients p
  where lower(p.data->>'last') like '%' || lower(p_q) || '%' or lower(p.data->>'first') like '%' || lower(p_q) || '%'
     or p.data->>'mrn' ilike p_q || '%' or p.data->>'dob' = p_q or lower((p.data->'ins'->>'member')) = lower(p_q)
  order by p.updated_at desc limit 200
$$;
create or replace function public.patient_orders(p_patient text)
returns table(id text, data jsonb, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select o.id, o.data, o.updated_at from orders o where o.data->>'patientId' = p_patient order by o.updated_at desc limit 500
$$;
create or replace function public.orders_by_ids(p_ids text[])
returns table(id text, data jsonb, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$ select o.id, o.data, o.updated_at from orders o where o.id = any(p_ids) $$;
create or replace function public.patients_by_ids(p_ids text[])
returns table(id text, data jsonb, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$ select p.id, p.data, p.updated_at from patients p where p.id = any(p_ids) $$;
create or replace function public.orders_before(p_before bigint, p_limit int)
returns table(id text, data jsonb, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select o.id, o.data, o.updated_at from orders o where (o.data->>'collectedAt')::bigint < p_before
  order by (o.data->>'collectedAt')::bigint desc limit least(greatest(p_limit, 1), 500)
$$;
create or replace function public.client_bill_orders(p_from bigint, p_to bigint)
returns table(id text, data jsonb, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select o.id, o.data, o.updated_at from orders o
  where o.data->>'billType' = 'Client bill' and o.data->>'status' = 'Released'
    and (o.data->>'collectedAt')::bigint >= p_from and (o.data->>'collectedAt')::bigint < p_to
$$;

-- Compact per-order facts for reports and quality indicators (no results, no patient details).
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
create or replace function public.claims_since(p_from bigint)
returns table(id text, data jsonb, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$ select c.id, c.data, c.updated_at from claims c where c.created_at >= to_timestamp(p_from / 1000.0) $$;
create or replace function public.patient_facts()
returns table(id text, clinic_id text, first text, last text, dob text, merged text)
language sql stable security invoker set search_path = public as $$
  select p.id, p.clinic_id, p.data->>'first', p.data->>'last', p.data->>'dob', p.data->>'mergedInto' from patients p
$$;
-- Released orders that don't have report statistics yet (filled in by Reports > Rebuild statistics).
create or replace function public.orders_missing_summary(p_limit int)
returns table(id text, data jsonb, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select o.id, o.data, o.updated_at from orders o where o.data->>'status' = 'Released' and not (o.data ? 'summary') limit least(greatest(p_limit,1), 200)
$$;

grant execute on function public.doc_window(text,int), public.changes_since(text,timestamptz), public.search_orders(text), public.search_patients(text),
  public.patient_orders(text), public.orders_by_ids(text[]), public.patients_by_ids(text[]), public.orders_before(bigint,int),
  public.client_bill_orders(bigint,bigint), public.order_facts(bigint,text), public.claims_since(bigint), public.patient_facts(),
  public.orders_missing_summary(int) to authenticated;
