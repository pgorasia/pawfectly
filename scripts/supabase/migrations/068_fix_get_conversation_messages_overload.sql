-- ============================================================================
-- Migration: Fix PostgREST overload ambiguity for get_conversation_messages
--
-- Problem:
-- - Two overloaded functions exist with the same named parameters, but different
--   positional order. PostgREST cannot choose the best candidate (PGRST203).
--
-- Fix:
-- - Drop the legacy overload(s) so only the canonical signature remains:
--     get_conversation_messages(
--       p_conversation_id uuid,
--       p_before_created_at timestamptz,
--       p_before_id bigint,
--       p_limit int
--     )
-- ============================================================================

-- Legacy overload observed in error:
DROP FUNCTION IF EXISTS public.get_conversation_messages(uuid, int, timestamptz, bigint);

-- Extra safety (no-ops if they don't exist in your DB):
DROP FUNCTION IF EXISTS public.get_conversation_messages(uuid, int, timestamptz, uuid);
DROP FUNCTION IF EXISTS public.get_conversation_messages(uuid, int, timestamptz, text);

