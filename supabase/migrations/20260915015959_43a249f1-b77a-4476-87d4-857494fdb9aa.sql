ALTER TABLE public.campaigns
  ADD COLUMN group_id uuid REFERENCES public.contact_groups(id) ON DELETE SET NULL,
  ADD COLUMN template_id uuid REFERENCES public.templates(id) ON DELETE SET NULL,
  ADD COLUMN media_url text;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaigns;