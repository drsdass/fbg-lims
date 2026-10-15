-- 0017: order attachments (reference lab reports such as the Amico DX PDF, and other PDFs).
-- Files are stored as <clinicId>/<orderId>/<uuid>-<name>.pdf in the private "order-files" bucket.
-- Lab staff can upload and read them. Clinic users can read the files of their own clinic's orders once the order is
-- released. Nobody can delete or overwrite a file: removing an attachment in the portal only hides it.
insert into storage.buckets (id, name, public) values ('order-files', 'order-files', false) on conflict (id) do nothing;
drop policy if exists order_files_lab_read on storage.objects;
drop policy if exists order_files_lab_insert on storage.objects;
drop policy if exists order_files_clinic_read on storage.objects;
create policy order_files_lab_read on storage.objects for select to authenticated
  using (bucket_id = 'order-files' and public.is_lab());
create policy order_files_lab_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'order-files' and public.is_lab()
              and (public.has_perm('results.enter') or public.has_perm('sendouts') or public.has_perm('results.release')));
create policy order_files_clinic_read on storage.objects for select to authenticated
  using (bucket_id = 'order-files'
         and (storage.foldername(name))[1] = public.my_clinic()
         and exists (select 1 from public.orders o
                     where o.id = (storage.foldername(name))[2] and o.clinic_id = public.my_clinic()
                       and o.data->>'status' = 'Released'));
