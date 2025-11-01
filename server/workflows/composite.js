/**
 * Image Compositing Workflow
 *
 * Combines segmented product (mask) with AI-generated background
 * Uses Sharp for high-performance image processing
 */

import sharp from 'sharp';
import { getStorage } from '../storage/index.js';

/**
 * Composite mask onto background
 *
 * @param {Object} params
 * @param {string} params.maskS3Key - S3 key for mask (transparent PNG)
 * @param {string} params.backgroundS3Key - S3 key for background (JPEG)
 * @param {string} params.sku - Product SKU
 * @param {string} params.sha256 - Image hash
 * @param {string} params.theme - Theme name
 * @param {number} params.variant - Variant number (default: 1)
 * @param {Object} params.options - Composite options
 * @returns {Promise<Object>} Result with s3Key, s3Url, metadata
 */
export async function compositeImage({
  maskS3Key,
  backgroundS3Key,
  sku,
  sha256,
  theme = 'default',
  variant = 1,
  options = {}
}) {
  const startTime = Date.now();

  console.log('[Compositor] Starting composite', {
    sku,
    theme,
    maskS3Key,
    backgroundS3Key
  });

  try {
    const storage = getStorage();

    // Step 1: Download mask and background from S3
    console.log('[Compositor] Downloading mask and background from S3...');

    const [maskBuffer, backgroundBuffer] = await Promise.all([
      downloadFromS3(storage, maskS3Key),
      downloadFromS3(storage, backgroundS3Key)
    ]);

    console.log('[Compositor] Downloaded:', {
      maskSize: `${(maskBuffer.length / 1024).toFixed(2)}KB`,
      backgroundSize: `${(backgroundBuffer.length / 1024).toFixed(2)}KB`
    });

    // Step 2: Get mask metadata (dimensions, format)
    const maskSharp = sharp(maskBuffer);
    const maskMeta = await maskSharp.metadata();

    console.log('[Compositor] Mask metadata:', {
      width: maskMeta.width,
      height: maskMeta.height,
      format: maskMeta.format,
      channels: maskMeta.channels,
      hasAlpha: maskMeta.hasAlpha
    });

    // Step 3: Resize background to match mask dimensions
    console.log('[Compositor] Resizing background to match mask...');

    const resizedBackground = await sharp(backgroundBuffer)
      .resize(maskMeta.width, maskMeta.height, {
        fit: options.fit || 'cover',       // cover, contain, fill, inside, outside
        position: options.position || 'center',
        kernel: 'lanczos3'                 // High-quality downscaling
      })
      .toBuffer();

    // Step 4: Composite mask over background
    console.log('[Compositor] Compositing mask onto background...');

    const compositeSharp = sharp(resizedBackground)
      .composite([{
        input: maskBuffer,
        blend: options.blend || 'over',    // Alpha blending mode
        gravity: 'center'
      }]);

    // Step 5: Apply post-processing (optional)
    if (options.sharpen) {
      compositeSharp.sharpen(options.sharpen);
    }

    if (options.gamma) {
      compositeSharp.gamma(options.gamma);
    }

    // Step 6: Convert to output format
    const outputFormat = options.format || 'jpeg';
    const quality = options.quality || 90;

    let compositeBuffer;
    if (outputFormat === 'jpeg' || outputFormat === 'jpg') {
      compositeBuffer = await compositeSharp
        .jpeg({
          quality,
          mozjpeg: true,              // Better compression
          chromaSubsampling: '4:4:4'  // No chroma subsampling for better quality
        })
        .toBuffer();
    } else if (outputFormat === 'png') {
      compositeBuffer = await compositeSharp
        .png({
          quality,
          compressionLevel: 9,
          adaptiveFiltering: true
        })
        .toBuffer();
    } else if (outputFormat === 'webp') {
      compositeBuffer = await compositeSharp
        .webp({
          quality,
          lossless: false,
          nearLossless: false
        })
        .toBuffer();
    } else {
      throw new Error(`Unsupported output format: ${outputFormat}`);
    }

    console.log('[Compositor] Composite created:', {
      size: `${(compositeBuffer.length / 1024).toFixed(2)}KB`,
      format: outputFormat,
      quality
    });

    // Step 7: Upload to S3
    const aspect = options.aspect || '1x1';
    const type = options.type || 'master';
    const compositeS3Key = storage.getCompositeKey(sku, sha256, theme, aspect, variant, type);
    const contentType = getContentType(outputFormat);

    console.log('[Compositor] Uploading to S3:', compositeS3Key);

    await storage.uploadBuffer(compositeS3Key, compositeBuffer, contentType);

    // Step 8: Generate presigned URL
    const compositeS3Url = await storage.getPresignedGetUrl(compositeS3Key, 3600);

    const duration = Date.now() - startTime;

    console.log('[Compositor] Composite complete:', {
      sku,
      theme,
      s3Key: compositeS3Key,
      duration: `${duration}ms`
    });

    // Step 9: Get final image metadata
    const finalMeta = await sharp(compositeBuffer).metadata();

    return {
      success: true,
      s3Key: compositeS3Key,
      s3Url: compositeS3Url,
      metadata: {
        duration,
        width: finalMeta.width,
        height: finalMeta.height,
        format: finalMeta.format,
        size: compositeBuffer.length,
        quality,
        blend: options.blend || 'over',
        inputMaskSize: maskBuffer.length,
        inputBackgroundSize: backgroundBuffer.length
      }
    };

  } catch (error) {
    const duration = Date.now() - startTime;

    console.error('[Compositor] Composite failed:', {
      sku,
      theme,
      error: error.message,
      duration: `${duration}ms`
    });

    return {
      success: false,
      error: error.message,
      metadata: {
        duration
      }
    };
  }
}

/**
 * Download file from S3 to buffer
 */
async function downloadFromS3(storage, s3Key) {
  try {
    // Get presigned URL and fetch the file
    const url = await storage.getPresignedGetUrl(s3Key, 300); // 5 minutes

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download ${s3Key}: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);

  } catch (error) {
    console.error('[Compositor] S3 download failed:', { s3Key, error: error.message });
    throw error;
  }
}

/**
 * Get MIME type for output format
 */
function getContentType(format) {
  const types = {
    'jpeg': 'image/jpeg',
    'jpg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp'
  };

  return types[format] || 'image/jpeg';
}

/**
 * Batch composite multiple backgrounds with same mask
 * Useful for generating multiple variants
 */
export async function batchComposite({
  maskS3Key,
  backgroundS3Keys,
  sku,
  sha256,
  theme,
  options = {}
}) {
  console.log('[Compositor] Starting batch composite:', {
    sku,
    theme,
    maskS3Key,
    backgroundCount: backgroundS3Keys.length
  });

  const results = [];

  for (let i = 0; i < backgroundS3Keys.length; i++) {
    const variant = i + 1;
    const result = await compositeImage({
      maskS3Key,
      backgroundS3Key: backgroundS3Keys[i],
      sku,
      sha256,
      theme,
      variant,
      options
    });

    results.push({
      variant,
      ...result
    });
  }

  const successCount = results.filter(r => r.success).length;

  console.log('[Compositor] Batch composite complete:', {
    total: results.length,
    success: successCount,
    failed: results.length - successCount
  });

  return {
    success: successCount === results.length,
    results,
    summary: {
      total: results.length,
      success: successCount,
      failed: results.length - successCount
    }
  };
}

export default {
  compositeImage,
  batchComposite
};
