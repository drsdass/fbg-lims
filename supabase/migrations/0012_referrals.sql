-- First Bio Genetics LIMS: electronic referrals to Amico DX (Icarus)
-- Run once in the Supabase SQL editor after 0011.
--
-- When lab staff click "Send to Amico DX", the portal writes one HL7 ORM^O01 order per specimen into
-- public.referrals. The Amico DX connector (a script on Amico's Icarus computer) collects them through the
-- referral-feed Edge Function using its own device key, hands each one to Icarus, and reports back
-- delivered / accepted / rejected. Results come back through instrument-upload as HL7 files.

-- Devices now carry a scope: 'instrument' (our own lab PCs) or 'amico' (the connector at Amico DX).
alter table public.instrument_devices add column if not exists scope text not null default 'instrument';
alter table public.instrument_devices drop constraint if exists instrument_devices_scope_chk;
alter table public.instrument_devices add constraint instrument_devices_scope_chk check (scope in ('instrument', 'amico'));

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  dest text not null default 'amico',
  manifest text not null,
  order_id text not null,
  accession text not null,
  tests text[] not null default '{}',
  message text not null,                     -- HL7 v2.5.1 ORM^O01
  status text not null default 'queued',     -- queued | delivered | accepted | rejected | cancelled
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  delivered_at timestamptz,
  acked_at timestamptz,
  note text,
  attempts int not null default 0,
  constraint referrals_status_chk check (status in ('queued', 'delivered', 'accepted', 'rejected', 'cancelled'))
);
create index if not exists referrals_status_idx on public.referrals (dest, status, created_at);
create index if not exists referrals_order_idx on public.referrals (order_id);

alter table public.referrals enable row level security;
-- Staff who handle send-outs can queue referrals, see their status, and re-queue or cancel them.
-- Nobody can delete them; the connector updates them only through the referral-feed function (service role).
create policy referrals_read on public.referrals for select to authenticated using (public.has_perm('sendouts'));
create policy referrals_insert on public.referrals for insert to authenticated with check (public.has_perm('sendouts'));
create policy referrals_update on public.referrals for update to authenticated
  using (public.has_perm('sendouts')) with check (public.has_perm('sendouts'));
revoke delete on public.referrals from authenticated;

-- Audit every referral and every status change (the generic audit trigger only tracks tables with a data column).
-- The HL7 message itself is not copied into the audit log.
create or replace function public.tg_audit_referral() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (actor, action, tbl, row_id, detail)
    values (auth.uid(), 'create', 'referrals', new.id::text,
            jsonb_build_object('dest', new.dest, 'manifest', new.manifest, 'accession', new.accession, 'tests', to_jsonb(new.tests)));
  elsif new.status is distinct from old.status then
    insert into public.audit_log (actor, action, tbl, row_id, detail)
    values (auth.uid(), 'update', 'referrals', new.id::text,
            jsonb_build_object('accession', new.accession, 'status', jsonb_build_array(old.status, new.status), 'note', new.note));
  end if;
  return null;
end $$;
drop trigger if exists audit on public.referrals;
create trigger audit after insert or update on public.referrals for each row execute function public.tg_audit_referral();
