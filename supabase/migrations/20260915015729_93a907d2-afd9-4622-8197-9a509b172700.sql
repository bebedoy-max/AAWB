
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  organization_name text NOT NULL DEFAULT 'My Organization',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TYPE public.wa_status AS ENUM ('connecting','connected','disconnected');
CREATE TABLE public.wa_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_name text NOT NULL,
  phone_number text,
  status public.wa_status NOT NULL DEFAULT 'disconnected',
  qr_string text,
  auth_keys_json jsonb,
  battery_level int,
  last_ping timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_sessions TO authenticated;
GRANT ALL ON public.wa_sessions TO service_role;
ALTER TABLE public.wa_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sessions" ON public.wa_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.contact_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_groups TO authenticated;
GRANT ALL ON public.contact_groups TO service_role;
ALTER TABLE public.contact_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own groups" ON public.contact_groups FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  group_id uuid REFERENCES public.contact_groups(id) ON DELETE SET NULL,
  name text NOT NULL,
  phone text NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contacts_user_idx ON public.contacts(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own contacts" ON public.contacts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  content text NOT NULL DEFAULT '',
  has_media boolean NOT NULL DEFAULT false,
  media_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.templates TO authenticated;
GRANT ALL ON public.templates TO service_role;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own templates" ON public.templates FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TYPE public.campaign_status AS ENUM ('draft','running','paused','completed','failed');
CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid REFERENCES public.wa_sessions(id) ON DELETE SET NULL,
  name text NOT NULL,
  total_targets int NOT NULL DEFAULT 0,
  status public.campaign_status NOT NULL DEFAULT 'draft',
  min_delay int NOT NULL DEFAULT 5,
  max_delay int NOT NULL DEFAULT 15,
  batch_limit int NOT NULL DEFAULT 100,
  scheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own campaigns" ON public.campaigns FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TYPE public.queue_status AS ENUM ('pending','processing','sent','failed');
CREATE TABLE public.message_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  recipient_phone text NOT NULL,
  message_body text NOT NULL,
  status public.queue_status NOT NULL DEFAULT 'pending',
  error_log text,
  attempts int NOT NULL DEFAULT 0,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX message_queue_campaign_idx ON public.message_queue(campaign_id);
CREATE INDEX message_queue_user_idx ON public.message_queue(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_queue TO authenticated;
GRANT ALL ON public.message_queue TO service_role;
ALTER TABLE public.message_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own queue" ON public.message_queue FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, organization_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'organization_name', 'My Organization'))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER PUBLICATION supabase_realtime ADD TABLE public.message_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_sessions;
