# Debug: AI Validation Not Triggering

## Issue
Photos are uploading but AI validation isn't running. Photos stay in `status='pending'` and never get updated.

## Checklist

### 1. Check if Edge Function is Deployed

```bash
# Check if function exists
supabase functions list

# If not deployed, deploy it:
supabase functions deploy validate-photo
```

### 2. Check Edge Function Logs

Go to **Supabase Dashboard → Edge Functions → validate-photo → Logs**

Look for:
- Errors when function is invoked
- Missing environment variables (OPENAI_API_KEY_DEV, GOOGLE_VISION_KEY_DEV)
- Function invocation errors

### 3. Check Client-Side Console

Open browser/app console and look for:
- `[PhotoUpload] Server validation failed:` errors
- `[PhotoService] Server validation error:` errors
- Any network errors when calling the edge function

### 4. Verify Edge Function is Being Called

Add logging to `photoService.ts`:

```typescript
export async function validatePhotoServerSide(photoId: string): Promise<ServerLabels> {
  console.log(`[PhotoService] Calling server validation for photo ${photoId}`);
  
  const { data, error } = await supabase.functions.invoke('validate-photo', {
    body: { photoId },
  });

  console.log('[PhotoService] Edge function response:', { data, error });

  if (error) {
    console.error('[PhotoService] Server validation error:', error);
    throw new Error(`Server validation failed: ${error.message}`);
  }
  // ...
}
```

### 5. Check Edge Function Environment Variables

The edge function needs:
- `OPENAI_API_KEY_DEV` - OpenAI API key for moderation
- `GOOGLE_VISION_KEY_DEV` - Google Vision API key
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (for admin access)

Set these in **Supabase Dashboard → Edge Functions → validate-photo → Settings → Environment Variables**

### 6. Test Edge Function Manually

You can test the edge function directly:

```typescript
// In browser console or test script
const { data, error } = await supabase.functions.invoke('validate-photo', {
  body: { photoId: 'your-photo-id-here' }
});
console.log({ data, error });
```

### 7. Check Storage Path Format

The storage path format is fine:
- Human: `users/{userId}/human/human/{timestamp}_{random}.jpg`
- Dog: `users/{userId}/dog/{dogId}/{timestamp}_{random}.jpg`

This is just folder organization and doesn't affect validation.

## Common Issues

1. **Edge function not deployed**: Deploy it with `supabase functions deploy validate-photo`
2. **Missing environment variables**: Set OPENAI_API_KEY_DEV and GOOGLE_VISION_KEY_DEV
3. **Function errors silently**: Check edge function logs in dashboard
4. **Network/CORS issues**: Check browser console for network errors
5. **Service role key missing**: Edge function needs service role key to update photos table

## Quick Fix: Add Better Error Logging

Update `photoService.ts` to log more details:

```typescript
export async function triggerServerValidation(photoId: string): Promise<void> {
  try {
    console.log(`[PhotoService] Starting validation for photo ${photoId}`);
    await validatePhotoServerSide(photoId);
    console.log(`[PhotoService] ✅ Validation completed for photo ${photoId}`);
  } catch (error) {
    console.error(`[PhotoService] ❌ Validation failed for photo ${photoId}:`, error);
    // Don't update status to rejected on error - let it stay pending
    // The edge function will handle status updates
  }
}
```

