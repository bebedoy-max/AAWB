-- Anti Ban: opsi per kampanye + daftar nomor yang tidak boleh dikirimi lagi.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS anti_ban boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.suppression_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  reason text NOT NULL DEFAULT 'manual',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, phone)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppression_list TO authenticated;
GRANT ALL ON public.suppression_list TO service_role;

ALTER TABLE public.suppression_list ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'suppression_list'
      AND policyname = 'Own suppression rows'
  ) THEN
    CREATE POLICY "Own suppression rows"
      ON public.suppression_list
      FOR ALL
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS suppression_list_phone_idx
  ON public.suppression_list (user_id, phone);
