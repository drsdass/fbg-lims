-- First Bio Genetics LIMS: instrument inbox (files uploaded automatically by the bridge on the lab PC)
-- Run once in the Supabase SQL editor after 0007.

create table if not exists public.instrument_devices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  token_hash text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  last_seen timestamptz
);
alter table public.instrument_devices enable row level security;
create policy devices_read on public.instrument_devices for select to authenticated using (public.is_lab());
create policy devices_insert on public.instrument_devices for insert to authenticated with check (public.has_perm('users'));
create policy devices_update on public.instrument_devices for update to authenticated using (public.has_perm('users')) with check (public.has_perm('users'));
revoke delete on public.instrument_devices from authenticated;

create table if not exists public.instrument_inbox (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references public.instrument_devices(id),
  instrument text not null,           -- 'c560' | 'sciex' | 'hl7'
  file_name text not null,
  size int not null default 0,
  content text not null,              -- base64
  received_at timestamptz not null default now(),
  status text not null default 'new', -- 'new' | 'imported' | 'dismissed'
  handled_at timestamptz,
  handled_by uuid,
  note text
);
create index if not exists instrument_inbox_status_idx on public.instrument_inbox (status, received_at);
alter table public.instrument_inbox enable row level security;
-- Files arrive only through the instrument-upload function (service role). Lab staff who import results can read and
-- mark them; nobody can delete them.
create policy inbox_read on public.instrument_inbox for select to authenticated using (public.has_perm('instruments') or public.has_perm('sendouts'));
create policy inbox_update on public.instrument_inbox for update to authenticated
  using (public.has_perm('instruments') or public.has_perm('sendouts')) with check (public.has_perm('instruments') or public.has_perm('sendouts'));
revoke insert, delete on public.instrument_inbox from authenticated;

drop trigger if exists audit on public.instrument_inbox;
create trigger audit after update on public.instrument_inbox for each row execute function public.tg_audit();
drop trigger if exists audit on public.instrument_devices;
create trigger audit after insert or update on public.instrument_devices for each row execute function public.tg_audit();
