/**
 * Derivative Image Generation Workflow (Flow v2)
 *
 * Generates multi-format, multi-size derivatives from composite images:
 * - Hero: 2000px max dimension (for website hero banners)
 * - PDP: 1200×1200 (for product detail pages)
 * - Thumb: 400×400 (for thumbnails/grids)
 *
 * Formats: JPEG, WebP, AVIF (9 files per composite)
 */

import sharp from 'sharp';
import { getStorage } from '../storage/index.js';

/**
 * Derivative size specifications
 */
const DERIVATIVE_SIZES = {
  hero: {
    width: 2000,
    height: 2000,
    fit: 'inside', // Maintain aspect ratio, max 2000px on longest edge
    description: 'Hero banner (max 2000px)'
  },
  pdp: {
    width: 1200,
    height: 1200,
    fit: 'cover', // Fill 1200×1200, center crop if needed
    description: 'Product detail page (1200×1200)'
  },
  thumb: {
    width: 400,
    height: 400,
    fit: 'cover', // Fill 400×400, center crop if needed
    description: 'Thumbnail (400×400)'
  }
};

/**
 * Output formats with quality settings
 */
const OUTPUT_FORMATS = {
  jpg: {
    quality: 90,
    options: {
      mozjpeg: true,
      chromaSubsampling: '4:4:4'
    },
    contentType: 'image/jpeg'
  },
  webp: {
    quality: 85,
    options: {
      lossless: false,
      nearLossless: false,
      effort: 4 // Balance between compression and speed
    },
    contentType: 'image/webp'
  },
  avif: {
    quality: 80,
    options: {
      lossless: false,
      effort: 4,
      chromaSubsampling: '4:4:4'
    },
    contentType: 'image/avif'
  }
};

/**
 * Generate all derivative sizes and formats for a composite
 *
 * @param {Object} params
 * @param {string} params.compositeS3Key - S3 key for source composite
 * @param {string} params.sku - Product SKU
 * @param {string} params.sha256 - Image hash
 * @param {string} params.theme - Theme name
 * @param {number} params.variant - Variant number
 * @returns {Promise<Object>} Result with derivative keys and metadata
 */
export async function generateDerivatives({
  compositeS3Key,
  sku,
  sha256,
  theme = 'default',
  variant = 1
}) {
  const startTime = Date.now();

  console.log('[Derivatives] Starting generation:', {
    sku,
    theme,
    variant,
    compositeS3Key
  });

  try {
    const storage = getStorage();

    // Step 1: Download composite from S3
    console.log('[Derivatives] Downloading composite from S3...');
    const compositeBuffer = await downloadFromS3(storage, compositeS3Key);

    console.log('[Derivatives] Downloaded:', {
      size: `${(compositeBuffer.length / 1024).toFixed(2)}KB`
    });

    // Step 2: Generate all derivatives (3 sizes × 3 formats = 9 files)
    const derivatives = [];
    const errors = [];

    for (const [sizeName, sizeConfig] of Object.entries(DERIVATIVE_SIZES)) {
      for (const [formatName, formatConfig] of Object.entries(OUTPUT_FORMATS)) {
        try {
          const result = await generateDerivative({
            compositeBuffer,
            sku,
            sha256,
            theme,
            variant,
            sizeName,
            sizeConfig,
            formatName,
            formatConfig,
            storage
          });

          derivatives.push(result);

        } catch (error) {
          console.error(`[Derivatives] Failed to generate ${sizeName}.${formatName}:`, error.message);
          errors.push({
            size: sizeName,
            format: formatName,
            error: error.message
          });
        }
      }
    }

    const duration = Date.now() - startTime;

    console.log('[Derivatives] Generation complete:', {
      sku,
      theme,
      variant,
      total: derivatives.length,
      failed: errors.length,
      duration: `${duration}ms`
    });

    // Return success even if some derivatives failed (partial success)
    return {
      success: derivatives.length > 0,
      derivatives,
      errors: errors.length > 0 ? errors : undefined,
      metadata: {
        duration,
        totalGenerated: derivatives.length,
        totalFailed: errors.length,
        inputSize: compositeBuffer.length
      }
    };

  } catch (error) {
    const duration = Date.now() - startTime;

    console.error('[Derivatives] Generation failed:', {
      sku,
      theme,
      variant,
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
 * Generate a single derivative (one size + one format)
 */
async function generateDerivative({
  compositeBuffer,
  sku,
  sha256,
  theme,
  variant,
  sizeName,
  sizeConfig,
  formatName,
  formatConfig,
  storage
}) {
  const derivativeStartTime = Date.now();

  // Step 1: Resize composite to target size
  let pipeline = sharp(compositeBuffer)
    .resize(sizeConfig.width, sizeConfig.height, {
      fit: sizeConfig.fit,
      position: 'center',
      kernel: 'lanczos3', // High-quality downscaling
      withoutEnlargement: false // Allow upscaling if needed
    });

  // Step 2: Convert to target format
  let derivativeBuffer;

  if (formatName === 'jpg') {
    derivativeBuffer = await pipeline
      .jpeg({
        quality: formatConfig.quality,
        ...formatConfig.options
      })
      .toBuffer();

  } else if (formatName === 'webp') {
    derivativeBuffer = await pipeline
      .webp({
        quality: formatConfig.quality,
        ...formatConfig.options
      })
      .toBuffer();

  } else if (formatName === 'avif') {
    derivativeBuffer = await pipeline
      .avif({
        quality: formatConfig.quality,
        ...formatConfig.options
      })
      .toBuffer();

  } else {
    throw new Error(`Unsupported format: ${formatName}`);
  }

  // Step 3: Upload to S3
  const derivativeS3Key = storage.getDerivativeKey(sku, sha256, theme, variant, sizeName, formatName);

  await storage.uploadBuffer(derivativeS3Key, derivativeBuffer, formatConfig.contentType);

  // Step 4: Generate presigned URL
  const derivativeS3Url = await storage.getPresignedGetUrl(derivativeS3Key, 3600);

  const derivativeDuration = Date.now() - derivativeStartTime;

  // Step 5: Get metadata
  const meta = await sharp(derivativeBuffer).metadata();

  console.log(`[Derivatives] Generated ${sizeName}.${formatName}:`, {
    s3Key: derivativeS3Key,
    size: `${(derivativeBuffer.length / 1024).toFixed(2)}KB`,
    dimensions: `${meta.width}×${meta.height}`,
    duration: `${derivativeDuration}ms`
  });

  return {
    size: sizeName,
    format: formatName,
    s3Key: derivativeS3Key,
    s3Url: derivativeS3Url,
    metadata: {
      width: meta.width,
      height: meta.height,
      fileSize: derivativeBuffer.length,
      quality: formatConfig.quality,
      duration: derivativeDuration
    }
  };
}

/**
 * Download file from S3 to buffer
 */
async function downloadFromS3(storage, s3Key) {
  try {
    const url = await storage.getPresignedGetUrl(s3Key, 300); // 5 minutes

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download ${s3Key}: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);

  } catch (error) {
    console.error('[Derivatives] S3 download failed:', { s3Key, error: error.message });
    throw error;
  }
}

/**
 * Batch generate derivatives for multiple composites
 */
export async function batchGenerateDerivatives({
  compositeS3Keys,
  sku,
  sha256,
  theme = 'default'
}) {
  console.log('[Derivatives] Starting batch generation:', {
    sku,
    theme,
    compositeCount: compositeS3Keys.length
  });

  const results = [];

  for (let i = 0; i < compositeS3Keys.length; i++) {
    const variant = i + 1;
    const result = await generateDerivatives({
      compositeS3Key: compositeS3Keys[i],
      sku,
      sha256,
      theme,
      variant
    });

    results.push({
      variant,
      ...result
    });
  }

  const successCount = results.filter(r => r.success).length;

  console.log('[Derivatives] Batch generation complete:', {
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
  generateDerivatives,
  batchGenerateDerivatives,
  DERIVATIVE_SIZES,
  OUTPUT_FORMATS
};
