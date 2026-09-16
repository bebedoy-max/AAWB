-- 002_rich_templates.sql
-- Rich message templates: media type, file name, footer text and link buttons.
-- Jalankan sekali di Supabase SQL Editor (Database -> SQL Editor -> New query).

ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS media_filename text,
  ADD COLUMN IF NOT EXISTS footer_text text,
  ADD COLUMN IF NOT EXISTS buttons_json jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.templates
  DROP CONSTRAINT IF EXISTS templates_media_type_check;
ALTER TABLE public.templates
  ADD CONSTRAINT templates_media_type_check
  CHECK (media_type IN ('text', 'image', 'document', 'video', 'audio'));

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS media_filename text,
  ADD COLUMN IF NOT EXISTS footer_text text,
  ADD COLUMN IF NOT EXISTS buttons_json jsonb NOT NULL DEFAULT '[]'::jsonb;
