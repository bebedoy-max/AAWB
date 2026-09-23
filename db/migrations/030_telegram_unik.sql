-- Jalankan sekali di Supabase Anda: Dashboard > SQL Editor > New query > paste > Run.
-- Satu akun Telegram hanya boleh dipakai oleh satu pengguna (worker).

-- Bersihkan kemungkinan duplikat lama: simpan tautan paling awal, kosongkan sisanya.
with ranked as (
  select user_id,
         chat_id,
         row_number() over (partition by chat_id order by connected_at nulls last, created_at) as rn
  from public.telegram_links
  where chat_id is not null
)
update public.telegram_links t
set chat_id = null,
    username = null,
    first_name = null,
    connected_at = null
from ranked r
where t.user_id = r.user_id and r.rn > 1;

create unique index if not exists uniq_telegram_links_chat_id
  on public.telegram_links (chat_id)
  where chat_id is not null;
