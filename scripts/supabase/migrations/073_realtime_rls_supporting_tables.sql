-- ============================================================================
-- Migration: Realtime RLS support for chat (conversation_participants)
--
-- Symptom:
-- - Realtime channels show SUBSCRIBED, publication contains tables, but no
--   postgres_changes payloads arrive.
--
-- Root cause (common):
-- - Realtime delivery evaluates SELECT policies for the changed row.
-- - Our conversation_messages SELECT policy checks conversation_participants.
-- - If conversation_participants has no SELECT grant / no RLS SELECT policy for
--   the caller, the EXISTS check fails (or errors), and events are not delivered.
--
-- Fix:
-- - Ensure authenticated can SELECT their own participant row.
-- - Ensure conversation_participants has RLS enabled and a SELECT policy.
-- ============================================================================

ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.conversation_participants TO authenticated;

DROP POLICY IF EXISTS conversation_participants_select_self ON public.conversation_participants;
CREATE POLICY conversation_participants_select_self
  ON public.conversation_participants
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

