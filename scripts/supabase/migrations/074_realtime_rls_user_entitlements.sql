-- ============================================================================
-- Migration: Realtime RLS support for read receipts (user_entitlements)
--
-- Symptom:
-- - Message INSERT realtime works after fixing conversation_participants RLS,
--   but "seen" (conversation_read_receipts) still doesn't update live.
--
-- Root cause:
-- - conversation_read_receipts SELECT policy checks that the subscriber is Plus:
--     EXISTS (SELECT 1 FROM public.user_entitlements ...)
-- - If user_entitlements is not selectable by authenticated users under RLS,
--   that EXISTS evaluates to false and realtime events are filtered out.
--
-- Fix:
-- - Ensure authenticated can SELECT their own user_entitlements row.
-- ============================================================================

ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.user_entitlements TO authenticated;

DROP POLICY IF EXISTS user_entitlements_select_self ON public.user_entitlements;
CREATE POLICY user_entitlements_select_self
  ON public.user_entitlements
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

