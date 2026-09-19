-- Jalankan sekali di Supabase Anda: Dashboard > SQL Editor > New query > paste > Run.
-- Menyimpan pilihan tema warna global untuk seluruh aplikasi.

alter table public.app_settings
  add column if not exists app_theme text not null default 'dark-emerald';

grant select (app_theme) on public.app_settings to authenticated;

drop policy if exists "authenticated read global app theme" on public.app_settings;
create policy "authenticated read global app theme" on public.app_settings
  for select to authenticated
  using (id = 'global');

alter table public.app_settings
  drop constraint if exists app_settings_app_theme_check;

alter table public.app_settings
  add constraint app_settings_app_theme_check check (
    app_theme in (
      'dark-emerald',
      'midnight-indigo',
      'semi-dark-teal',
      'semi-dark-amber',
      'light-mint-fresh',
      'warm-cream-peach',
      'pastel-lavender'
    )
  );