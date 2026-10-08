-- 0012: QC review sign-off.
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
