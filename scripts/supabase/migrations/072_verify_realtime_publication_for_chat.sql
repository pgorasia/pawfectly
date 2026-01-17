-- ============================================================================
-- Migration: Verify Realtime publication wiring for chat tables (no silent failure)
--
-- Goal:
-- - Ensure the project publication used by Supabase Realtime contains the tables.
-- - Fail loudly if we cannot guarantee it (no "it should work" band-aids).
-- ============================================================================

DO $$
DECLARE
  v_pub regclass;
  v_missing text[];
BEGIN
  -- Supabase hosted uses publication "supabase_realtime".
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE EXCEPTION 'Publication supabase_realtime does not exist. Enable Realtime in Supabase project settings.';
  END IF;

  -- Try to add tables if missing.
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_messages';
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_read_receipts';
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  -- Verify presence.
  v_missing := ARRAY[]::text[];

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'conversation_messages'
  ) THEN
    v_missing := v_missing || ARRAY['public.conversation_messages'];
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'conversation_read_receipts'
  ) THEN
    v_missing := v_missing || ARRAY['public.conversation_read_receipts'];
  END IF;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'Realtime not enabled for required tables: %', array_to_string(v_missing, ', ');
  END IF;
END $$;

