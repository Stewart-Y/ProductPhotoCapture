# Workflows Module

This directory contains business logic orchestration for multi-step image processing pipelines.

## Files

- `enhance-photo.js` - Enhanced photo workflow (legacy from old system)
- `segment-photo.js` - AI segmentation workflow
- `generate-background.js` - Themed background generation workflow
- `composite.js` - Sharp-based compositing engine
- `sync-to-shopify.js` - End-to-end Shopify sync workflow

## Compositing Pipeline

The compositing engine uses Sharp to merge segmented bottle with new background:

### Steps:
1. **Load Assets**
   - Original image (RGB)
   - Alpha mask (grayscale PNG)
   - Background image (RGB)

2. **Mask Processing**
   - Erode 1px (remove edge artifacts)
   - Feather 1-2px (smooth transitions)

3. **Edge Spill Suppression**
   - Analyze background mean hue
   - Adjust bottle edge pixels to match

4. **Composite**
   - Layer bottle over background using alpha mask

5. **Synthetic Shadow**
   - Offset: 8-16px down-right (theme-dependent)
   - Gaussian blur: 8-16px
   - Opacity: 20-35%

6. **White Balance**
   - Adjust bottle to match background lighting
   - Ensure label ΔE < 5 (perceptual color difference)

7. **Export**
   - Master: 3000px (max dimension), JPEG Q92
   - Shopify: 2048px square + 4:5 crop, JPEG Q92 + WebP
   - Thumbnails: 400px, JPEG Q85

## Quality Gates

Before exporting, validate:
- ✅ Output long edge ≥ 1600px
- ✅ Bottle pixels unchanged (compare with original)
- ✅ Label color difference ΔE < 5
- ✅ No visible edge artifacts

If validation fails, job moves to `FAILED` with error code `QUALITY_CHECK_FAILED`.

## Example Usage

```javascript
import { compositeBottle } from './workflows/composite.js';

const result = await compositeBottle({
  originalUrl: 's3://bucket/originals/SKU/abc.jpg',
  maskUrl: 's3://bucket/masks/SKU/abc.png',
  backgroundUrl: 's3://bucket/backgrounds/halloween/SKU/abc_1.jpg',
  theme: 'halloween',
  outputDir: 's3://bucket/composites/halloween/SKU/'
});

// result = {
//   master: 's3://bucket/composites/halloween/SKU/abc_1x1_master.jpg',
//   shopify: 's3://bucket/composites/halloween/SKU/abc_1x1_shopify.jpg',
//   thumbnail: 's3://bucket/thumbs/SKU/abc_400.jpg',
//   metadata: { width, height, fileSize, duration }
// }
```
