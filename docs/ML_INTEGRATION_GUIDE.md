# ML Model Integration Guide

## Overview
The photo upload system requires a real ML model to detect dogs and humans in images. The current implementation uses a placeholder that needs to be replaced.

## Requirements
The detector must:
1. **Scan the actual image content** (not filenames)
2. **Detect dogs**: Return `dog: true` if a dog is detected
3. **Detect humans**: Return `human: true` if a human is detected
4. **Classify correctly**:
   - Dog only → `DOG_ONLY`
   - Human only → `HUMAN_ONLY`
   - Both → `HUMAN_AND_DOG`
   - Neither → `NEITHER` (reject)

## Integration Options

### Option 1: TensorFlow Lite (Recommended for On-Device)
**Pros**: Fast, private (on-device), no API costs
**Cons**: Requires native modules, larger app size

**Steps**:
1. Install dependencies:
   ```bash
   npm install @tensorflow/tfjs @tensorflow/tfjs-react-native @tensorflow/tfjs-platform-react-native
   ```

2. Download a pre-trained model (COCO-SSD or custom):
   - COCO-SSD detects 80 classes including 'person' and 'dog'
   - Or train a custom model for better accuracy

3. Update `pawfectly/services/ai/detector.ts`:
   ```typescript
   import * as tf from '@tensorflow/tfjs';
   import '@tensorflow/tfjs-react-native';

   class RealEntityDetector implements EntityDetector {
     private model: tf.LayersModel | null = null;

     async loadModel() {
       // Load your model
       this.model = await tf.loadLayersModel(modelPath);
     }

     async detectEntities(imageUri: string): Promise<DetectorResult> {
       if (!this.model) await this.loadModel();
       
       // Preprocess image
       const imageTensor = await this.preprocessImage(imageUri);
       
       // Run inference
       const predictions = await this.model.predict(imageTensor) as tf.Tensor;
       const detections = await this.parseDetections(predictions);
       
       // Check for dog and human
       const hasDog = detections.some(d => d.class === 'dog');
       const hasHuman = detections.some(d => d.class === 'person');
       
       return {
         dog: hasDog,
         human: hasHuman,
         confidence: Math.max(...detections.map(d => d.confidence)),
         classification: getClassification(hasDog, hasHuman),
         isNSFW: await this.checkNSFW(imageUri),
       };
     }
   }
   ```

### Option 2: Cloud API (Google Cloud Vision)
**Pros**: Easy to integrate, high accuracy, no model management
**Cons**: Requires internet, API costs, privacy concerns

**Steps**:
1. Set up Google Cloud Vision API
2. Install: `npm install @google-cloud/vision`
3. Update detector to call API:
   ```typescript
   import { ImageAnnotatorClient } from '@google-cloud/vision';

   async detectEntities(imageUri: string): Promise<DetectorResult> {
     const client = new ImageAnnotatorClient();
     const imageBuffer = await FileSystem.readAsStringAsync(imageUri, {
       encoding: FileSystem.EncodingType.Base64,
     });
     
     const [result] = await client.objectLocalization({
       image: { content: imageBuffer },
     });
     
     const objects = result.localizedObjectAnnotations || [];
     const hasDog = objects.some(obj => obj.name === 'Dog');
     const hasHuman = objects.some(obj => obj.name === 'Person');
     
     return {
       dog: hasDog,
       human: hasHuman,
       confidence: Math.max(...objects.map(o => o.score || 0)),
       classification: getClassification(hasDog, hasHuman),
       isNSFW: await this.checkNSFW(imageUri),
     };
   }
   ```

### Option 3: MediaPipe (Google)
**Pros**: On-device, fast, good accuracy
**Cons**: Requires native setup

**Steps**:
1. Follow MediaPipe React Native integration guide
2. Use object detection or custom task
3. Update detector implementation

## NSFW Detection
For NSFW detection, consider:
- TensorFlow Lite NSFW model (NudeNet, etc.)
- Cloud API SafeSearch (Google Cloud Vision)
- AWS Rekognition Content Moderation

## Testing
After integration:
1. Test with various images (dog only, human only, both, neither)
2. Verify classification accuracy
3. Test edge cases (blurry, dark, multiple subjects)
4. Measure performance (inference time)

## Current Status
The detector at `pawfectly/services/ai/detector.ts` uses a placeholder implementation. Replace `MockEntityDetector` with `RealEntityDetector` once ML is integrated.

