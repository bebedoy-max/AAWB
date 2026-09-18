-- Jalankan sekali di Supabase Anda: SQL Editor > New query > paste > Run.
-- Satu nomor WhatsApp kini boleh dipakai sampai 4 perangkat (multi-device).

-- 1. Hapus aturan lama "satu nomor hanya untuk satu perangkat"
drop index if exists public.wa_sessions_phone_unique;

-- 2. Batas baru: maksimal 4 perangkat untuk nomor yang sama
create or replace function public.enforce_phone_device_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  used int;
begin
  if new.phone_number is null then
    return new;
  end if;

  select count(*) into used
  from public.wa_sessions
  where phone_number = new.phone_number
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if used >= 4 then
    raise exception 'Nomor ini sudah dipakai pada 4 perangkat (maksimal 4)';
  end if;

  return new;
end $$;

drop trigger if exists wa_sessions_phone_device_limit on public.wa_sessions;
create trigger wa_sessions_phone_device_limit
before insert or update of phone_number on public.wa_sessions
for each row execute function public.enforce_phone_device_limit();
