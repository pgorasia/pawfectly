# Photo Validation 401 Error - Troubleshooting Guide

## What Could Have Broken Between Jan 6-7

Based on the code structure, here are the most likely causes:

### 1. **Missing or Reset Environment Variable** (MOST LIKELY)
   - **Symptom**: 401 errors from OpenAI API
   - **Cause**: `OPENAI_API_KEY_DEV` secret was deleted, reset, or not set in Supabase
   - **Check**: 
     - Go to Supabase Dashboard → Project Settings → Edge Functions → Secrets
     - Verify `OPENAI_API_KEY_DEV` exists and has a valid value
   - **Fix**: 
     ```bash
     supabase secrets set OPENAI_API_KEY_DEV=sk-your-actual-key-here
     ```
     Then redeploy:
     ```bash
     supabase functions deploy validate-photo
     ```

### 2. **Function Redeployed Without Secrets**
   - **Symptom**: Function works but can't access secrets
   - **Cause**: Function was redeployed but secrets weren't included
   - **Fix**: Redeploy the function (secrets are injected at deploy time)

### 3. **Internal Secret Added/Changed**
   - **Symptom**: 401 errors from the function itself (not OpenAI)
   - **Cause**: `PAWFECTLY_INTERNAL_SECRET` was set/changed, causing auth failures
   - **Check**: Look at the error message - if it says "Unauthorized" from validate-photo (not OpenAI), this is the issue
   - **Fix**: 
     - Either remove `PAWFECTLY_INTERNAL_SECRET` if you don't need it
     - Or ensure `process-photo-jobs` is passing the correct secret header

### 4. **OpenAI API Key Expired/Rotated**
   - **Symptom**: 401 from OpenAI API specifically
   - **Cause**: API key was rotated or account was suspended
   - **Check**: Test the API key directly:
     ```bash
     curl https://api.openai.com/v1/models \
       -H "Authorization: Bearer YOUR_API_KEY"
     ```
   - **Fix**: Update the secret with the new key

### 5. **Supabase Project Secrets Reset**
   - **Symptom**: All edge functions lose access to secrets
   - **Cause**: Project was reset, migrated, or secrets were bulk-deleted
   - **Fix**: Re-add all required secrets

## Diagnostic Steps

### Step 1: Check Function Logs
Look at the exact error in Supabase Dashboard → Edge Functions → validate-photo → Logs:
- If you see: `"OPENAI_API_KEY_DEV environment variable is not set"` → Secret is missing
- If you see: `"Unauthorized"` from validate-photo → Internal secret mismatch
- If you see: `401` from `api.openai.com` → API key is invalid/expired

### Step 2: Verify Secrets Are Set
```bash
# List all secrets (if you have CLI access)
supabase secrets list
```

Or check in Dashboard: Project Settings → Edge Functions → Secrets

### Step 3: Test the Function Manually
```bash
# Test with a sample photo payload
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/validate-photo \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-photo-id",
    "user_id": "test-user-id",
    "storage_path": "test/path.jpg",
    "bucket_type": "dog",
    "status": "pending"
  }'
```

### Step 4: Check process-photo-jobs
The validation is triggered by `process-photo-jobs`. Check if:
- It's running (check logs)
- It's successfully calling `validate-photo`
- Jobs are stuck in `photo_validation_jobs` table

## Quick Fix Checklist

1. ✅ Verify `OPENAI_API_KEY_DEV` exists in Supabase secrets
2. ✅ Verify the API key value is correct (starts with `sk-`)
3. ✅ Redeploy `validate-photo` function after setting secrets
4. ✅ Check if `PAWFECTLY_INTERNAL_SECRET` is set (and matches between functions)
5. ✅ Verify `process-photo-jobs` is running and calling `validate-photo`
6. ✅ Check `photo_validation_jobs` table for stuck jobs

## Most Common Fix

**90% of the time, it's a missing secret:**

```bash
# Set the secret
supabase secrets set OPENAI_API_KEY_DEV=sk-your-key-here

# Redeploy the function
supabase functions deploy validate-photo

# Also redeploy process-photo-jobs if it exists
supabase functions deploy process-photo-jobs
```

## Code Changes That Could Break It

If code was changed between Jan 6-7, check:
- ✅ Line 82, 146 in `validate-photo/index.ts` - API key access
- ✅ Line 16-24 in `validate-photo/index.ts` - Internal secret check
- ✅ Line 80-96 in `process-photo-jobs/index.ts` - How it calls validate-photo
- ✅ Any changes to how secrets are accessed (`Deno.env.get()`)

The code I just added will now log a clear error if the API key is missing, making future debugging easier.
