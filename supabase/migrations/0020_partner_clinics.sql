-- First Bio Genetics LIMS: partner labs' client clinics get their own accounts
-- Run once in the Supabase SQL editor after 0019.
--
-- When a partner lab (for example Peak Panel Laboratory) sends an order for one of its client clinics, the partner-api
-- Edge Function creates an FBG account for that clinic the first time (status active, linked to the partner through
-- data.partnerParent), so reports, invoices and insights show the real clinic. Only the Edge Function (service role)
-- can call this.

create or replace function public.partner_clinic_insert(p_parent text, p_data jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_n bigint; v_id text; v_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if not exists (select 1 from clinics where id = p_parent and (data->'partner'->>'enabled') = 'true') then
    raise exception 'Unknown partner lab';
  end if;
  v_n := public.next_seq_internal('clinic_acct');
  v_id := 'c' || v_n::text;
  perform set_config('fbg.registering', '1', true);
  insert into clinics(id, data) values (v_id,
    p_data || jsonb_build_object('id', v_id, 'acct', 'FBG-' || v_n::text, 'status', 'active', 'partnerParent', p_parent, 'createdAt', v_ms));
  return v_id;
end $$;
revoke execute on function public.partner_clinic_insert(text, jsonb) from public, anon, authenticated;
grant execute on function public.partner_clinic_insert(text, jsonb) to service_role;
create index if not exists clinics_partner_parent_idx on public.clinics ((data->>'partnerParent'));
create index if not exists orders_partner_lab_idx on public.orders ((data->'partner'->>'lab'));
