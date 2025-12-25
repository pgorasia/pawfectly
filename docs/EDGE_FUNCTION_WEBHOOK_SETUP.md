# Edge Function Webhook Setup

## Overview

The `validate-photo` edge function is triggered by a database webhook when a new photo is inserted into the `photos` table.

## Setup Steps

### 1. Deploy the Edge Function

```bash
supabase functions deploy validate-photo
```

### 2. Set Environment Variables

In Supabase Dashboard → Edge Functions → validate-photo → Settings:

- `OPENAI_API_KEY` - Your OpenAI API key
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key

### 3. Create Database Webhook

Go to Supabase Dashboard → Database → Webhooks → Create a new webhook:

**Configuration:**
- **Name:** `photo_validation_webhook`
- **Table:** `photos`
- **Events:** `INSERT`
- **HTTP Request:**
  - **URL:** `https://[your-project-ref].supabase.co/functions/v1/validate-photo`
  - **HTTP Method:** `POST`
  - **HTTP Headers:**
    ```
    Authorization: Bearer [YOUR_SERVICE_ROLE_KEY]
    Content-Type: application/json
    ```

**Payload:**
The webhook will automatically send the inserted row as `{ "record": { ... } }`

### 4. Test the Webhook

1. Upload a photo through your app
2. Check the edge function logs: Dashboard → Edge Functions → validate-photo → Logs
3. Check the photos table - status should update from 'pending' to 'approved' or 'rejected'

## Function Flow

1. **Webhook Trigger:** DB INSERT on `photos` table
2. **Generate Public URL:** Get public URL for the image
3. **OpenAI Moderation:** Check for NSFW/disallowed content
   - If flagged → reject, delete file, return
4. **OpenAI Vision:** Analyze image for human/dog/text
5. **Apply Rules:**
   - If hasText → reject, delete file
   - If bucket_type='human' → approve if hasHuman, reject if not
   - If bucket_type='dog' → approve if hasDog, reject if not
6. **Update Database:** Set status and metadata

## Approval Rules

### Human Bucket
- ✅ Approve if `hasHuman=true`
- ❌ Reject if `hasHuman=false` (reason: `missing_human`)

### Dog Bucket
- ✅ Approve if `hasDog=true` OR (`hasHuman=true` AND `hasDog=true`)
- ❌ Reject if `hasDog=false` (reason: `missing_dog`)

### Universal Rules
- ❌ Reject if `hasText=true` (reason: `contains_contact_info`)
- ❌ Reject if moderation flagged (reason: `nsfw_or_disallowed`)

## Rejection Behavior

When a photo is rejected:
1. Status updated to `'rejected'`
2. `rejection_reason` set
3. **File deleted from Storage** (hard requirement)

## Logging

The function logs:
- Photo ID
- Bucket type
- Moderation results
- Vision analysis results
- Approval/rejection decisions
- Storage deletion status

**Never logs:** Image bytes or full image URLs (only paths)

