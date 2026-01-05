-- Migration: Create prompt_questions and dog_prompt_answers tables
-- This allows users to add up to 2 prompts per dog

-- ============================================================================
-- PROMPT_QUESTIONS TABLE: Stores available prompt questions
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.prompt_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text TEXT NOT NULL,
  suggestions TEXT, -- Optional suggestions/placeholder text
  display_order INT, -- Optional ordering for display
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for active questions
CREATE INDEX IF NOT EXISTS idx_prompt_questions_active 
  ON public.prompt_questions(is_active, display_order NULLS LAST);

-- ============================================================================
-- DOG_PROMPT_ANSWERS TABLE: Stores user answers to prompts for each dog
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.dog_prompt_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dog_slot INTEGER NOT NULL CHECK (dog_slot >= 1 AND dog_slot <= 3),
  prompt_question_id UUID NOT NULL REFERENCES public.prompt_questions(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL,
  display_order INTEGER NOT NULL CHECK (display_order IN (1, 2)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Unique constraint: one answer per (user_id, dog_slot, display_order)
  CONSTRAINT uq_dog_prompt_answers_user_slot_order 
    UNIQUE (user_id, dog_slot, display_order),
  -- Unique constraint: prevent same prompt question twice for same dog
  CONSTRAINT uq_dog_prompt_answers_user_slot_question 
    UNIQUE (user_id, dog_slot, prompt_question_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_dog_prompt_answers_user_slot 
  ON public.dog_prompt_answers(user_id, dog_slot);

CREATE INDEX IF NOT EXISTS idx_dog_prompt_answers_question 
  ON public.dog_prompt_answers(prompt_question_id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE public.prompt_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dog_prompt_answers ENABLE ROW LEVEL SECURITY;

-- Prompt questions: Public read access for active questions
DROP POLICY IF EXISTS "Anyone can read active prompt questions" ON public.prompt_questions;
CREATE POLICY "Anyone can read active prompt questions"
  ON public.prompt_questions
  FOR SELECT
  USING (is_active = true);

-- Dog prompt answers: Users can manage their own answers
DROP POLICY IF EXISTS "Users can read their own prompt answers" ON public.dog_prompt_answers;
CREATE POLICY "Users can read their own prompt answers"
  ON public.dog_prompt_answers
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own prompt answers" ON public.dog_prompt_answers;
CREATE POLICY "Users can insert their own prompt answers"
  ON public.dog_prompt_answers
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own prompt answers" ON public.dog_prompt_answers;
CREATE POLICY "Users can update their own prompt answers"
  ON public.dog_prompt_answers
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own prompt answers" ON public.dog_prompt_answers;
CREATE POLICY "Users can delete their own prompt answers"
  ON public.dog_prompt_answers
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- TRIGGER: Auto-update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_prompt_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_prompt_questions_updated_at ON public.prompt_questions;
CREATE TRIGGER update_prompt_questions_updated_at
  BEFORE UPDATE ON public.prompt_questions
  FOR EACH ROW
  EXECUTE FUNCTION update_prompt_updated_at();

DROP TRIGGER IF EXISTS update_dog_prompt_answers_updated_at ON public.dog_prompt_answers;
CREATE TRIGGER update_dog_prompt_answers_updated_at
  BEFORE UPDATE ON public.dog_prompt_answers
  FOR EACH ROW
  EXECUTE FUNCTION update_prompt_updated_at();

-- ============================================================================
-- SEED INITIAL PROMPT QUESTIONS
-- ============================================================================

INSERT INTO public.prompt_questions (question_text, suggestions, display_order) VALUES
  ('My dog''s love language is:', 'treats / praise / fetch / cuddles / personal space', 1),
  ('Most dramatic thing my dog does is:', NULL, 2),
  ('My dog would 100% judge you for:', 'not sharing snacks, walking too slowly, etc.', 3),
  ('The one thing my dog is weirdly obsessed with:', 'sticks, shadows, squeaky donuts, etc.', 4),
  ('The funniest compliment my dog has ever received:', NULL, 5),
  ('A time my dog chose chaos over peace:', NULL, 6),
  ('Our most wholesome moment was:', NULL, 7),
  ('My dog''s greatest accomplishment is:', 'graduated puppy class, mastered recall, conquered the vacuum', 8),
  ('Teach my dog a new skill and I''ll:', 'share treats / buy coffee / swap training tips', 9),
  ('If my dog could leave a review of me, it would say:', NULL, 10),
  ('My dog''s biggest flex is:', 'e.g., "can hear a cheese wrapper from three rooms away."', 11),
  ('My dog is convinced they invented:', 'fetch / naps / barking at delivery drivers', 12),
  ('My dog''s most unhinged opinion is:', 'e.g., "all squirrels are personal enemies."', 13),
  ('The thing my dog thinks they''re famous for:', NULL, 14),
  ('My dog''s villain origin story started when:', 'bath time / nail trim / vacuum appeared', 15),
  ('If my dog had a podcast, it would be called:', NULL, 16),
  ('My dog''s toxic trait is thinking they can:', 'fit on my lap / outrun bikes / negotiate rules', 17),
  ('My dog''s guilty pleasure is:', 'rolling in questionable smells / stealing socks', 18),
  ('If my dog ran for mayor, their campaign promise would be:', NULL, 19),
  ('The one rule my dog thinks is optional:', 'no jumping / no barking / "leave it"', 20),
  ('The pettiest thing my dog has ever done is:', NULL, 21),
  ('My dog believes their job title is:', 'home security / crumb inspector / emotional support supervisor', 22)
ON CONFLICT DO NOTHING;
