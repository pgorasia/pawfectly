# Troubleshooting "Network request failed" on Photo Upload

## Error
When uploading a photo in Expo Go, you get: `"Failed to upload photo to storage: Network request failed"`

## Common Causes & Solutions

### 1. **Network Connectivity**
- **Check**: Ensure your device/emulator has internet access
- **Fix**: Test by opening a browser and visiting a website
- **For Emulator**: Ensure your computer has internet access
- **For Physical Device**: Check WiFi/cellular connection

### 2. **Supabase URL Configuration**
- **Check**: Verify `EXPO_PUBLIC_SUPABASE_URL` is set correctly in your `.env` file
- **Common Issue**: URL points to `localhost` which won't work on physical devices
- **Fix**: Use your actual Supabase project URL (e.g., `https://xxxxx.supabase.co`)
- **Note**: Expo Go bundles environment variables at build time, so restart the Expo server after changing `.env`

### 3. **Restart Expo After Environment Variable Changes**
- **Issue**: Expo Go caches environment variables
- **Fix**: 
  1. Stop Expo (`Ctrl+C`)
  2. Clear cache: `npx expo start --clear`
  3. Reload the app in Expo Go

### 4. **Storage Bucket Doesn't Exist**
- **Check**: Go to Supabase Dashboard → Storage → Verify `photos` bucket exists
- **Fix**: Create the bucket if it doesn't exist (should be PUBLIC for now)

### 5. **Storage RLS Policies**
- **Check**: Verify RLS policies allow INSERT for authenticated users
- **Fix**: Run the storage RLS migration SQL:
  ```sql
  -- See: scripts/supabase/migrations/003_setup_storage_rls.sql
  ```

### 6. **Authentication Token Not Sent**
- **Check**: Verify you're signed in before uploading
- **Fix**: The code now checks for session before upload - if this fails, sign in again

### 7. **File Size Too Large**
- **Check**: The code resizes images to 512px max, but check console logs for file size
- **Fix**: If file is still too large, reduce `MAX_LONG_EDGE` in `resizeAndUploadPhoto.ts`

### 8. **Expo Go Limitations**
- **Note**: Expo Go has some limitations with certain native modules
- **Alternative**: Try using a development build instead of Expo Go
- **Test**: Try the same code on a physical device vs emulator

## Debugging Steps

1. **Check Console Logs**: The updated code now logs:
   - Image conversion success/failure
   - Session verification
   - Upload start and error details
   - Supabase URL configuration

2. **Test Supabase Connection**:
   ```typescript
   // Add this temporarily to test connection
   const { data, error } = await supabase.storage.from('photos').list('', { limit: 1 });
   console.log('Storage test:', { data, error });
   ```

3. **Check Network Tab**: 
   - If using Expo Go web version, check browser DevTools Network tab
   - Look for failed requests to Supabase storage endpoint

4. **Verify Environment Variables**:
   ```bash
   # In your terminal, check if variables are set
   echo $EXPO_PUBLIC_SUPABASE_URL
   echo $EXPO_PUBLIC_SUPABASE_ANON_KEY
   ```

## Code Changes Made

The code has been updated with:
- ✅ Better error logging (shows exact error details)
- ✅ Session verification before upload
- ✅ More reliable base64 to Uint8Array conversion for React Native
- ✅ Configuration checks (Supabase URL verification)

## Next Steps

1. **Check the console logs** when the error occurs - they will show exactly where it fails
2. **Verify your `.env` file** has the correct Supabase URL and key
3. **Restart Expo** with `--clear` flag after changing `.env`
4. **Test on a different network** to rule out network issues
5. **Try a development build** instead of Expo Go if the issue persists

