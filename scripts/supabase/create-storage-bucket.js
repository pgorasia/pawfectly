/**
 * Script to create required storage buckets in Supabase
 * Run with: node scripts/supabase/create-storage-bucket.js
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  console.error('Set them in your .env file or as environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function ensureBucket(name, options) {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;

  const existing = buckets?.find((b) => b.name === name);
  if (existing) {
    console.log(`✅ Bucket already exists: ${name}`);
    return;
  }

  const { error } = await supabase.storage.createBucket(name, options);
  if (error) throw error;

  console.log(`✅ Bucket created: ${name}`);
}

async function createBuckets() {
  console.log('Creating required storage buckets...');

  try {
    // Public profile photo bucket (existing app behavior)
    await ensureBucket('photos', {
      public: true,
      fileSizeLimit: 10485760, // 10MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    });

    // Private selfie verification bucket (Phase 1: manual review)
    await ensureBucket('selfie_verifications', {
      public: false,
      fileSizeLimit: 10485760, // 10MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    });

    console.log('📝 Next steps:');
    console.log('   1. Go to Supabase Dashboard → Storage');
    console.log('   2. Ensure RLS policies exist for storage.objects (see latest migrations for selfie policies)');
  } catch (error) {
    console.error('❌ Failed to create buckets:', error.message);
    console.error('\n💡 Alternative: Create buckets manually in Supabase Dashboard:');
    console.error('   - photos (public: true)');
    console.error('   - selfie_verifications (public: false)');
    process.exit(1);
  }
}

createBuckets();
