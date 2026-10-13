-- 0014: QC review sign-off, custom vial barcodes.
-- Scientists (and anyone with the "qc" permission) can record a daily QC review ("qcreview") in qms_records.
-- Reviews are insert-only: a new review for the same instrument and day is added, never edited, so the history stays intact.
drop policy if exists qms_insert on public.qms_records;
create policy qms_insert on public.qms_records for insert to authenticated
  with check (
    public.is_lab() and (
      kind in ('maintenance','temp','ack','run')
      or (kind = 'qcreview' and public.has_perm('qc'))
      or public.has_perm('qms')
    )
  );

-- Custom vial labeling (e.g. Oratek): orders can carry the clinic's own vial barcode.
-- Search finds an order by it, and the C560 interface looks orders up by it.
create index if not exists orders_vial_idx on public.orders ((data->>'vialBarcode'));
create index if not exists orders_accession_idx on public.orders ((data->>'accession'));
create or replace function public.search_orders(p_q text)
returns table(id text, data jsonb, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select o.id, o.data, o.updated_at from orders o
  where o.data->>'accession' ilike '%' || p_q || '%'
     or o.data->>'vialBarcode' ilike p_q || '%'
     or o.data->>'patientId' in (select p.id from patients p where lower(p.data->>'last') like '%' || lower(p_q) || '%' or lower(p.data->>'first') like '%' || lower(p_q) || '%' or p.data->>'mrn' ilike p_q || '%')
  order by o.updated_at desc limit 200
$$;
