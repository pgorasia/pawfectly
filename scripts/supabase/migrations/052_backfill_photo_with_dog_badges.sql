-- Migration: Backfill photo_with_dog badges for existing users
-- Awards the badge to users who already have approved photos with dog and human

-- Backfill photo_with_dog badges for existing users who have eligible photos
INSERT INTO trust_badges (user_id, badge_type, earned_at, status, revoked_at, metadata)
SELECT DISTINCT p.user_id, 'photo_with_dog', NULL, 'earned'::badge_status, NULL, NULL
FROM photos p
WHERE p.status = 'approved'
  AND p.contains_dog = true
  AND p.contains_human = true
  AND NOT EXISTS (
    SELECT 1
    FROM trust_badges tb
    WHERE tb.user_id = p.user_id
      AND tb.badge_type = 'photo_with_dog'
  )
ON CONFLICT (user_id, badge_type) DO NOTHING;
