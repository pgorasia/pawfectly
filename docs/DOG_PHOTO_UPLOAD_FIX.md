# Dog Photo Upload Issues - Fixed

## Issues Found and Fixed

### 1. Constraint Violation
**Problem:** Dog photos couldn't be uploaded because constraint required `dog_id IS NOT NULL` for dog bucket.

**Fix:** Run migration `011_fix_dog_id_constraint.sql` to allow null `dog_id` for dog bucket (for onboarding).

### 2. Duplicate Photo Record Creation
**Problem:** `photoUpload.ts` was calling both `resizeAndUploadPhoto` (which already creates DB record) AND `createPhotoRecord` (duplicate insert).

**Fix:** Removed duplicate `createPhotoRecord` call. `resizeAndUploadPhoto` already creates the record.

### 3. Wrong Function Parameters
**Problem:** `photoUpload.ts` was passing `bucketName` and `supabaseClient` to `resizeAndUploadPhoto`, which don't exist in the function signature.

**Fix:** Updated to pass correct parameters: `userId`, `bucketType`, `dogId`, `localUri`, `mimeType`.

### 4. Edge Function Mismatch
**Problem:** Edge function expected webhook payload with `target_type`, but we were calling it with `{ photoId }`. Also used wrong field names.

**Fix:** 
- Updated edge function to accept `{ photoId }` and fetch photo record from DB
- Changed `target_type` to `bucket_type` (matches database)
- Updated to set correct fields: `contains_dog`, `contains_human`, `contains_both`, `ai_labels`, `ai_text`, `classification`

### 5. Temporary Dog IDs
**Question:** Why do we need temporary IDs?

**Answer:** During onboarding, dogs are created in the profile draft with temporary IDs (like `dog-1234567890`) before being saved to the database. We have two options:

**Option A (Current):** Allow `dog_id = null` for dog bucket photos during onboarding, then update them when dogs are saved.

**Option B (Better):** Save dogs to database first, then upload photos. This requires updating the onboarding flow to save dogs before the photos page.

For now, Option A is implemented. You can switch to Option B later if preferred.

## Next Steps

1. **Run the constraint fix:**
   ```sql
   -- Run: scripts/supabase/migrations/011_fix_dog_id_constraint.sql
   ```

2. **Redeploy the edge function:**
   ```bash
   supabase functions deploy validate-photo
   ```

3. **Test upload:**
   - Try uploading a dog photo
   - Check the database - should see `status='pending'` initially
   - Wait a few seconds - should update to `status='approved'` or `'rejected'` with proper fields set

## Debugging Rejection Reasons

To see which API rejected the photo, check the `rejection_reason` field:
- `"Inappropriate content detected."` = OpenAI moderation rejected
- `"Please remove text/social handles from the photo."` = Too much text detected
- `"No human detected in this photo."` = Google Vision didn't detect human (for human bucket)
- `"No dog detected in this photo."` = Google Vision didn't detect dog (for dog bucket)

If `rejection_reason` is `null` but `status='rejected'`, check the edge function logs for errors.

