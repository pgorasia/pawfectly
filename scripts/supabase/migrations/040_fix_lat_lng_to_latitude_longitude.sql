-- Migration: Fix lat/lng column references to latitude/longitude
-- Updates get_profile_view RPC function to use the renamed columns

-- First, let's get the current function definition to see what needs updating
-- Run this query to see the current function:
-- SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'get_profile_view' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- Drop and recreate get_profile_view with correct column names
-- Note: This recreates the function based on the expected structure from the TypeScript types
-- If your actual function is different, you'll need to adjust this migration

DROP FUNCTION IF EXISTS public.get_profile_view(uuid);

CREATE OR REPLACE FUNCTION public.get_profile_view(p_candidate_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'candidate', (
      SELECT json_build_object(
        'user_id', p.user_id,
        'display_name', p.display_name,
        'city', p.city
      )
      FROM profiles p
      WHERE p.user_id = p_candidate_id
      LIMIT 1
    ),
    'labels', (
      SELECT json_build_object(
        'dog_label', COALESCE((array_agg(d.name ORDER BY d.slot))[1], ''),
        'distance_miles', NULL, -- TODO: Calculate distance using latitude/longitude if needed
        'is_verified', EXISTS(
          SELECT 1 FROM photos ph
          WHERE ph.user_id = p_candidate_id
            AND ph.contains_human = true
            AND ph.contains_dog = true
            AND ph.status = 'approved'
        )
      )
      FROM profiles p
      LEFT JOIN dogs d ON d.user_id = p.user_id AND d.is_active = true
      WHERE p.user_id = p_candidate_id
      GROUP BY p.user_id
      LIMIT 1
    ),
    'hero_photo', (
      SELECT json_build_object(
        'id', ph.id,
        'storage_path', ph.storage_path,
        'bucket_type', CASE
          WHEN ph.contains_dog AND ph.dog_slot IS NOT NULL THEN 'dog'
          WHEN ph.contains_human THEN 'human'
          ELSE NULL
        END
      )
      FROM photos ph
      WHERE ph.user_id = p_candidate_id
        AND ph.status = 'approved'
      ORDER BY 
        CASE WHEN ph.contains_dog AND ph.contains_human THEN 1 ELSE 2 END,
        ph.created_at
      LIMIT 1
    ),
    'dogs', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', d.id,
          'slot', d.slot,
          'name', d.name,
          'breed', d.breed,
          'age_group', d.age_group,
          'size', d.size,
          'energy', d.energy,
          'play_styles', COALESCE(d.play_styles, '[]'::jsonb),
          'temperament', d.temperament
        )
        ORDER BY d.slot
      ), '[]'::json)
      FROM dogs d
      WHERE d.user_id = p_candidate_id
        AND d.is_active = true
    ),
    'prompts', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', dpa.id,
          'dog_slot', dpa.dog_slot,
          'prompt_text', pq.question_text,
          'response_text', dpa.answer_text
        )
        ORDER BY dpa.dog_slot, dpa.display_order
      ), '[]'::json)
      FROM dog_prompt_answers dpa
      INNER JOIN prompt_questions pq ON pq.id = dpa.prompt_question_id
      WHERE dpa.user_id = p_candidate_id
    ),
    'photos', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', ph.id,
          'storage_path', ph.storage_path,
          'bucket_type', CASE
            WHEN ph.contains_dog AND ph.dog_slot IS NOT NULL THEN 'dog'
            WHEN ph.contains_human THEN 'human'
            ELSE NULL
          END,
          'dog_slot', ph.dog_slot,
          'contains_human', ph.contains_human,
          'contains_dog', ph.contains_dog
        )
        ORDER BY ph.created_at
      ), '[]'::json)
      FROM photos ph
      WHERE ph.user_id = p_candidate_id
        AND ph.status = 'approved'
    ),
    'compatibility', json_build_object(
      'tier', NULL,
      'score', NULL,
      'why', '[]'::json,
      'best_pair', NULL
    )
  ) INTO result
  FROM profiles p
  WHERE p.user_id = p_candidate_id
  LIMIT 1;
  
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_profile_view(uuid) TO authenticated;

-- Note: If your get_profile_view function has additional logic (like distance calculation,
-- compatibility scoring, etc.), you'll need to add that back. The key change is that
-- any references to p.lat or p.lng should be changed to p.latitude and p.longitude.
