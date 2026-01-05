-- Migration: Add RLS policies for swipes table
-- This allows users to manage their own swipes (including undo functionality)

-- Enable RLS on swipes table if not already enabled
ALTER TABLE public.swipes ENABLE ROW LEVEL SECURITY;

-- Users can read their own swipes
DROP POLICY IF EXISTS "Users can read their own swipes" ON public.swipes;
CREATE POLICY "Users can read their own swipes"
  ON public.swipes
  FOR SELECT
  USING (auth.uid() = viewer_id);

-- Users can insert their own swipes
DROP POLICY IF EXISTS "Users can insert their own swipes" ON public.swipes;
CREATE POLICY "Users can insert their own swipes"
  ON public.swipes
  FOR INSERT
  WITH CHECK (auth.uid() = viewer_id);

-- Users can update their own swipes
DROP POLICY IF EXISTS "Users can update their own swipes" ON public.swipes;
CREATE POLICY "Users can update their own swipes"
  ON public.swipes
  FOR UPDATE
  USING (auth.uid() = viewer_id)
  WITH CHECK (auth.uid() = viewer_id);

-- Users can delete their own swipes (for undo functionality)
DROP POLICY IF EXISTS "Users can delete their own swipes" ON public.swipes;
CREATE POLICY "Users can delete their own swipes"
  ON public.swipes
  FOR DELETE
  USING (auth.uid() = viewer_id);
