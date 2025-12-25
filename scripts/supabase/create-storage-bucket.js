/**
 * Script to create the photos storage bucket in Supabase
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

async function createPhotosBucket() {
  console.log('Creating photos storage bucket...');

  try {
    // Check if bucket already exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      throw listError;
    }

    const photosBucket = buckets?.find(b => b.name === 'photos');
    
    if (photosBucket) {
      console.log('✅ Photos bucket already exists');
      return;
    }

    // Create the bucket
    const { data, error } = await supabase.storage.createBucket('photos', {
      public: true, // Make bucket public for easy access
      fileSizeLimit: 10485760, // 10MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    });

    if (error) {
      throw error;
    }

    console.log('✅ Photos bucket created successfully');
    console.log('📝 Next steps:');
    console.log('   1. Go to Supabase Dashboard → Storage → photos');
    console.log('   2. Set up RLS policies for security');
    console.log('   3. See scripts/supabase/create-storage-bucket.sql for policy examples');
  } catch (error) {
    console.error('❌ Failed to create bucket:', error.message);
    console.error('\n💡 Alternative: Create the bucket manually in Supabase Dashboard:');
    console.error('   1. Go to Storage → Create Bucket');
    console.error('   2. Name: photos');
    console.error('   3. Public: true');
    console.error('   4. Set up RLS policies');
    process.exit(1);
  }
}

createPhotosBucket();

