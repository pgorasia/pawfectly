# Troubleshooting ML Detection Issues

## Problem: "This photo doesn't appear to contain a dog or person"

If you're getting this error even when uploading valid dog/human photos, it's likely because:

### 1. TensorFlow.js Compatibility Issue
TensorFlow.js with COCO-SSD works best in **Expo Web**, but may not work properly in React Native (iOS/Android) without additional setup.

**Solution:**
- **Test in Expo Web**: Press `w` in your Expo CLI to open in web browser
- The ML detection should work properly in web
- For production native apps, consider:
  - Using Expo Web for photo upload flow
  - Implementing TensorFlow Lite (requires native modules)
  - Using a cloud API (Google Cloud Vision, AWS Rekognition)

### 2. Model Not Loading
The COCO-SSD model needs to download on first use (~5-10MB).

**Check:**
- Internet connection (model downloads from CDN)
- Console logs for model loading errors
- Model should cache after first download

### 3. Detection Confidence Too Low
The model might detect objects but with low confidence.

**Solution:**
- Check console logs for detected objects
- Confidence threshold is set to 0.3 (30%)
- If objects are detected but below threshold, they're ignored

### 4. Image Format Issues
Some image formats might not work properly.

**Solution:**
- Use JPEG or PNG images
- Ensure image is not corrupted
- Try a different image

## Debugging Steps

1. **Check Console Logs**
   Look for:
   - `[Detector] Loading COCO-SSD model...`
   - `[Detector] COCO-SSD model loaded successfully`
   - `[Detector] Running object detection on image...`
   - `[Detector] Detections: X objects found`
   - `[Detector] All detected objects: [...]`

2. **Check for Errors**
   Look for:
   - `[Detector] Detection failed: ...`
   - `[Detector] ⚠️ TensorFlow.js may not be compatible...`
   - `[PhotoUpload] Detection error: ...`

3. **Test in Expo Web**
   ```bash
   # In your terminal, press 'w' when Expo is running
   # Or run: npm start --web
   ```

4. **Use Mock Detector for Testing**
   Set in `.env` or `app.json`:
   ```json
   {
     "expo": {
       "extra": {
         "EXPO_PUBLIC_MOCK_AI_MODE": "always_dog"  // or "always_human", "always_both"
       }
     }
   }
   ```

## Quick Fix: Use Expo Web

The easiest solution for now is to test photo uploads in Expo Web:

1. Start Expo: `npm start`
2. Press `w` to open in web browser
3. Try uploading photos - ML detection should work

## Alternative Solutions

### Option 1: Cloud API (Recommended for Production)
Use Google Cloud Vision API (free tier: 1000 requests/month):
- Works everywhere (web, iOS, Android)
- Very accurate
- Requires API key setup

### Option 2: TensorFlow Lite
For native apps:
- Faster than TensorFlow.js
- Better React Native support
- Requires native modules setup

### Option 3: Hybrid Approach
- Use TensorFlow.js for web
- Use cloud API for native
- Fallback to mock for development

## Current Status

The ML detector is implemented but may have compatibility issues in React Native. For best results:
- ✅ Use Expo Web for testing
- ⚠️ Native apps may need additional setup
- 📝 Check console logs for detailed error messages

