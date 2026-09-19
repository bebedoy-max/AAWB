-- Batas keras jumlah peran: maksimal 2 super admin dan 3 admin.
-- Berlaku untuk semua jalur (aplikasi, SQL manual, trigger pendaftaran).

create or replace function public.enforce_role_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jumlah int;
  batas int;
begin
  if new.role not in ('super_admin', 'admin') then
    return new;
  end if;

  batas := case when new.role = 'super_admin' then 2 else 3 end;

  select count(*) into jumlah
  from public.user_roles
  where role = new.role
    and user_id <> new.user_id;

  if jumlah >= batas then
    raise exception 'Kuota peran % sudah penuh (maksimal %).', new.role, batas;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_role_quota on public.user_roles;
create trigger trg_enforce_role_quota
before insert or update on public.user_roles
for each row execute function public.enforce_role_quota();

revoke execute on function public.enforce_role_quota() from public, anon, authenticated;
