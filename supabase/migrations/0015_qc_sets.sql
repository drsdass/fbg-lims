-- 0015: QC control sets.
-- Anyone with the "qc" permission (scientists, QA, admins) can create, edit and retire control sets ("qcset" records).
-- Daily QC reviews ("qcreview", 0014) stay insert-only.
drop policy if exists qms_insert on public.qms_records;
create policy qms_insert on public.qms_records for insert to authenticated
  with check (
    public.is_lab() and (
      kind in ('maintenance','temp','ack','run')
      or (kind in ('qcreview','qcset') and public.has_perm('qc'))
      or public.has_perm('qms')
    )
  );
drop policy if exists qms_update on public.qms_records;
create policy qms_update on public.qms_records for update to authenticated
  using (public.has_perm('qms') or (kind = 'qcset' and public.has_perm('qc')))
  with check (public.has_perm('qms') or (kind = 'qcset' and public.has_perm('qc')));
