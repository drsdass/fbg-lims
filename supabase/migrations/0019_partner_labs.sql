-- First Bio Genetics LIMS: partner lab interface (for example Peak Panel Laboratory)
-- Run once in the Supabase SQL editor after 0018.
--
-- A partner lab's LIMS sends orders and collects released results through the partner-api Edge Function, using an API
-- key created in the portal (Partner labs). Keys live in instrument_devices with scope 'partner' and the partner's
-- account (clinic_id). partner_log records every order, cancel request, results hand-over and acknowledgement;
-- partner_deliveries remembers which report versions the partner has confirmed, so each is sent until it's received.

alter table public.instrument_devices add column if not exists clinic_id text;
alter table public.instrument_devices drop constraint if exists instrument_devices_scope_chk;
alter table public.instrument_devices add constraint instrument_devices_scope_chk check (scope in ('instrument', 'amico', 'partner'));

create table if not exists public.partner_log (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references public.instrument_devices(id),
  clinic_id text not null,
  kind text not null,                 -- order | cancel | results | ack | error
  partner_order_id text,
  order_id text,
  accession text,
  ok boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  handled_at timestamptz,             -- set by staff when a cancel request has been dealt with
  handled_by uuid
);
create index if not exists partner_log_clinic_idx on public.partner_log (clinic_id, created_at desc);
alter table public.partner_log enable row level security;
drop policy if exists partner_log_read on public.partner_log;
create policy partner_log_read on public.partner_log for select to authenticated using (public.is_lab());
drop policy if exists partner_log_handle on public.partner_log;
create policy partner_log_handle on public.partner_log for update to authenticated
  using (public.has_perm('orders.enter') or public.has_perm('orders.receive')) with check (public.has_perm('orders.enter') or public.has_perm('orders.receive'));
revoke insert, delete on public.partner_log from authenticated;

create table if not exists public.partner_deliveries (
  order_id text not null,
  version int not null,               -- report version; 0 = rejection notice
  delivered_at timestamptz,
  acked_at timestamptz,
  attempts int not null default 0,
  primary key (order_id, version)
);
alter table public.partner_deliveries enable row level security;
drop policy if exists partner_deliveries_read on public.partner_deliveries;
create policy partner_deliveries_read on public.partner_deliveries for select to authenticated using (public.is_lab());
revoke insert, update, delete on public.partner_deliveries from authenticated;

-- The Edge Function numbers new orders from the same accession sequence the portal uses.
grant execute on function public.next_seq_internal(text) to service_role;
