# Quick Fix: "Bucket not found" Error

## Problem
You're getting the error: `Failed to upload image: Bucket not found`

This means the Supabase Storage bucket named `photos` doesn't exist yet.

## Solution (Choose One)

### Option 1: Create via Supabase Dashboard (Fastest - 2 minutes)

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Click **Storage** in the left sidebar
4. Click **"New bucket"** or **"Create bucket"**
5. Fill in:
   - **Name**: `photos` (exactly this name, lowercase)
   - **Public bucket**: ✅ Check this box (or configure RLS policies later)
   - **File size limit**: 10MB (or your preferred limit)
   - **Allowed MIME types**: `image/jpeg, image/png, image/webp`
6. Click **"Create bucket"**

**Done!** Try uploading a photo again.

### Option 2: Create via Script

```bash
# Set your Supabase credentials (get from Dashboard → Settings → API)
export SUPABASE_URL=your_supabase_url
export SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Run the script
node scripts/supabase/create-storage-bucket.js
```

### Option 3: Create via Supabase CLI

```bash
# Install Supabase CLI if needed
npm install -g supabase

# Login and link your project
supabase login
supabase link --project-ref your-project-ref

# Create the bucket
supabase storage create photos --public
```

## Verify It Works

After creating the bucket:
1. Go to Storage → photos in your Supabase Dashboard
2. You should see the bucket listed
3. Try uploading a photo in your app again

## Next Steps (Optional - Security)

After creating the bucket, you may want to set up RLS policies:

1. Go to Storage → photos → Policies
2. Create policies for:
   - **INSERT**: Allow authenticated users to upload
   - **SELECT**: Allow public read (or authenticated only)
   - **DELETE**: Allow users to delete their own files

See `scripts/supabase/create-storage-bucket.sql` for policy examples.

