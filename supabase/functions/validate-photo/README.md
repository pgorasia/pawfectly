# Validate Photo Edge Function

Server-side photo validation using trusted AI model.

## Setup

1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Login to Supabase:
   ```bash
   supabase login
   ```

3. Link your project:
   ```bash
   supabase link --project-ref <your-project-ref>
   ```

4. Set the required environment variable in Supabase Dashboard:
   - Go to your Supabase project dashboard
   - Navigate to **Project Settings** → **Edge Functions** → **Secrets**
   - Add a secret named: `OPENAI_API_KEY_DEV`
   - Set the value to your OpenAI API key
   - Click **Save**

   Alternatively, using Supabase CLI:
   ```bash
   supabase secrets set OPENAI_API_KEY_DEV=your-api-key-here
   ```

5. Deploy the function:
   ```bash
   supabase functions deploy validate-photo
   ```

## Usage

Call the function from your app:

```typescript
const { data, error } = await supabase.functions.invoke('validate-photo', {
  body: { photoId: 'uuid-of-photo' }
});
```

## Implementation Notes

Currently, this is a stub implementation that:
- Downloads the photo from storage
- Uses client labels as fallback (in production, replace with actual server-side ML model)
- Updates photo status to 'validated' or 'rejected'
- Updates profile verification status

To implement real server-side validation:
1. Replace the stub validation logic with your ML model
2. Update `modelVersion` in serverLabels
3. Consider using cloud ML services (Google Vision API, AWS Rekognition) or a custom model

