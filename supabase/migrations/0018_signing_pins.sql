-- 0018: signing PINs. Lab staff can set a 4- to 6-digit PIN and use it instead of their password to sign result
-- releases (they are already signed in with two-step verification). Only a bcrypt hash is stored, in a table no one can
-- read directly. Five wrong PINs in a row lock PIN signing for 15 minutes (the password still works).
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.signing_pins (
  user_id uuid primary key, pin_hash text not null, set_at timestamptz not null default now(),
  failed int not null default 0, locked_until timestamptz
);
alter table public.signing_pins enable row level security;
revoke all on public.signing_pins from authenticated, anon;

create or replace function public.set_signing_pin(p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null or not public.is_lab() then raise exception 'Only signed-in lab staff can set a signing PIN'; end if;
  if p_pin !~ '^[0-9]{4,6}$' then raise exception 'The PIN must be 4 to 6 digits'; end if;
  if p_pin ~ '^(.)\1+$' or position(p_pin in '0123456789012345') > 0 or position(p_pin in '9876543210987654') > 0 then
    raise exception 'Choose a PIN that isn''t a repeated or sequential number';
  end if;
  insert into signing_pins (user_id, pin_hash, set_at, failed, locked_until)
    values (auth.uid(), crypt(p_pin, gen_salt('bf', 10)), now(), 0, null)
    on conflict (user_id) do update set pin_hash = excluded.pin_hash, set_at = now(), failed = 0, locked_until = null;
  insert into audit_log (actor, action, tbl, row_id, detail) values (auth.uid(), 'set_signing_pin', 'signing_pins', auth.uid()::text, '{}'::jsonb);
end $$;

create or replace function public.has_signing_pin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from signing_pins where user_id = auth.uid())
$$;

-- Returns 'ok', 'wrong', 'locked' or 'none'.
create or replace function public.verify_signing_pin(p_pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare r signing_pins%rowtype;
begin
  select * into r from signing_pins where user_id = auth.uid() for update;
  if not found then return 'none'; end if;
  if r.locked_until is not null and r.locked_until > now() then return 'locked'; end if;
  if r.pin_hash = crypt(coalesce(p_pin, ''), r.pin_hash) then
    update signing_pins set failed = 0, locked_until = null where user_id = auth.uid();
    return 'ok';
  end if;
  if r.failed + 1 >= 5 then
    update signing_pins set failed = 0, locked_until = now() + interval '15 minutes' where user_id = auth.uid();
    insert into audit_log (actor, action, tbl, row_id, detail) values (auth.uid(), 'signing_pin_locked', 'signing_pins', auth.uid()::text, '{}'::jsonb);
    return 'locked';
  end if;
  update signing_pins set failed = r.failed + 1 where user_id = auth.uid();
  return 'wrong';
end $$;

create or replace function public.clear_signing_pin() returns void
language sql security definer set search_path = public as $$
  delete from signing_pins where user_id = auth.uid();
$$;
grant execute on function public.set_signing_pin(text), public.has_signing_pin(), public.verify_signing_pin(text), public.clear_signing_pin() to authenticated;
