# ML Detection Setup - TensorFlow.js + COCO-SSD

## Overview
The photo upload system now uses **TensorFlow.js with COCO-SSD** for real-time object detection. This is a free, open-source solution that runs on-device.

## What It Does
- **Detects "person" (human)** in images
- **Detects "dog"** in images  
- **Classifies photos** as:
  - `DOG_ONLY` - Only dog detected
  - `HUMAN_ONLY` - Only human detected
  - `HUMAN_AND_DOG` - Both detected
  - `NEITHER` - Neither detected (rejected)

## How It Works
1. **Model Loading**: COCO-SSD model loads on first use (cached after that)
2. **Image Processing**: Image is prepared for detection
3. **Object Detection**: Model scans image pixels to find objects
4. **Classification**: Results are parsed to determine what was found

## Platform Support
- ✅ **Expo Web**: Fully supported
- ✅ **Expo (iOS/Android)**: Should work, may need additional setup for native
- ⚠️ **Note**: For native apps, TensorFlow.js uses WebGL/CPU backend

## Performance
- **First detection**: ~2-3 seconds (model download + inference)
- **Subsequent detections**: ~500ms-1s (cached model)
- **Model size**: ~5-10MB (downloaded once, then cached)

## Configuration

### Enable Real ML (Default)
The real ML detector is enabled by default. To disable and use mock:
```bash
# Set in .env or app.json
EXPO_PUBLIC_MOCK_AI_MODE=always_both
```

### Use Mock Detector
To use the mock detector for testing:
```bash
EXPO_PUBLIC_MOCK_AI_MODE=always_dog  # Always detect dog
EXPO_PUBLIC_MOCK_AI_MODE=always_human  # Always detect human
EXPO_PUBLIC_MOCK_AI_MODE=always_both  # Always detect both
EXPO_PUBLIC_MOCK_AI_MODE=always_neither  # Always reject
```

## Troubleshooting

### Model Fails to Load
- Check internet connection (model downloads on first use)
- Check console for specific error messages
- Model is cached after first download

### Detection Not Working in Native
- TensorFlow.js may need additional setup for React Native
- Consider using Expo web for testing
- For production native apps, consider TensorFlow Lite instead

### Slow Performance
- First detection is slower (model download)
- Subsequent detections are faster (cached model)
- Consider resizing images before detection for faster processing

## Future Enhancements
- [ ] Add NSFW detection model
- [ ] Optimize for native (TensorFlow Lite)
- [ ] Add confidence threshold tuning
- [ ] Cache detection results

## Dependencies
- `@tensorflow/tfjs` - TensorFlow.js core
- `@tensorflow-models/coco-ssd` - COCO-SSD object detection model

