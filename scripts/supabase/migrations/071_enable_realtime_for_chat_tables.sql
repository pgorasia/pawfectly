-- ============================================================================
-- Migration: Enable Realtime for chat tables (correct fix)
--
-- Why this is needed:
-- - Your app currently reads messages via RPC (SECURITY DEFINER), so missing
--   SELECT privileges / RLS policies on conversation_messages won't be noticed.
-- - Supabase Realtime delivery DOES require the subscriber to be allowed to SELECT
--   the row (RLS), otherwise no events are delivered.
-- - The tables also must be added to the supabase_realtime publication.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Ensure RLS is enabled and a SELECT policy exists for participants
-- ---------------------------------------------------------------------------

ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'conversation_messages'
      AND policyname = 'conversation_messages_select_participants'
  ) THEN
    CREATE POLICY conversation_messages_select_participants
      ON public.conversation_messages
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.conversation_participants cp
          WHERE cp.conversation_id = conversation_messages.conversation_id
            AND cp.user_id = auth.uid()
            AND cp.removed_at IS NULL
        )
      );
  END IF;
END $$;

GRANT SELECT ON TABLE public.conversation_messages TO authenticated;

-- conversation_read_receipts already has RLS policy in migration 070, but ensure GRANT SELECT exists.
GRANT SELECT ON TABLE public.conversation_read_receipts TO authenticated;


-- ---------------------------------------------------------------------------
-- 2) Add tables to Supabase Realtime publication
-- ---------------------------------------------------------------------------
-- Note: Supabase creates publication "supabase_realtime" in hosted projects.
-- These commands are idempotent via exception handling.

DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_messages';
EXCEPTION WHEN duplicate_object THEN
  -- already added
  NULL;
END $$;

DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_read_receipts';
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

