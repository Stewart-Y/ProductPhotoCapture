/**
 * Image Enhancement Workflow
 *
 * Standalone AI-powered image upscaling using Real-ESRGAN via Replicate
 * Independent from the product photo workflow
 */

import { nanoid } from 'nanoid';
import sharp from 'sharp';
import { getStorage } from '../storage/index.js';
import { ReplicateUpscaleProvider } from '../providers/replicate/upscale.js';
import { ClarityUpscaleProvider } from '../providers/replicate/clarity.js';

/**
 * Enhance (upscale) image using AI
 *
 * @param {Object} params
 * @param {string} params.inputS3Key - S3 key for input image
 * @param {number} params.scale - Scale factor: 2, 4, or 8 (default: 4)
 * @param {boolean} params.faceEnhance - Enable face enhancement (default: false)
 * @param {string} params.model - Model to use: 'real-esrgan' or 'clarity' (default: 'clarity')
 * @param {Object} params.db - Database instance
 * @returns {Promise<Object>} Enhancement result with enhancement ID and URLs
 */
export async function enhanceImage({ inputS3Key, scale = 4, faceEnhance = false, model = 'clarity', db }) {
  const startTime = Date.now();
  const enhancementId = nanoid();

  console.log('[Enhance] Starting image enhancement', {
    enhancementId,
    inputS3Key,
    scale,
    faceEnhance,
    model
  });

  try {
    // Step 1: Validate scale factor
    if (![2, 4, 8].includes(scale)) {
      throw new Error(`Invalid scale factor: ${scale}. Must be 2, 4, or 8.`);
    }

    // Step 2: Create enhancement record in database
    db.prepare(`
      INSERT INTO enhancements (id, input_s3_key, scale_factor, status, cost)
      VALUES (?, ?, ?, 'processing', ?)
    `).run(enhancementId, inputS3Key, scale, 0.024);

    const storage = getStorage();

    // Step 3: Get presigned URL for input image (Replicate needs public URL)
    console.log('[Enhance] Getting presigned URL for input image...');
    const inputUrl = await storage.getPresignedGetUrl(inputS3Key, 600); // 10 minutes

    // Step 4: Download input image and check/resize if needed
    let inputBuffer = await downloadFromUrl(inputUrl);
    const inputMetadata = await sharp(inputBuffer).metadata();

    console.log('[Enhance] Input image metadata:', {
      width: inputMetadata.width,
      height: inputMetadata.height,
      format: inputMetadata.format,
      size: `${(inputBuffer.length / 1024).toFixed(2)}KB`
    });

    // Calculate max dimensions (GPU memory limit: ~2M pixels = 1448x1448)
    const maxPixels = 2000000; // Safe limit below GPU max
    const totalPixels = inputMetadata.width * inputMetadata.height;
    let resizedForProcessing = false;
    let processingUrl = inputUrl;

    if (totalPixels > maxPixels) {
      // Resize to fit within GPU memory constraints
      const scaleFactor = Math.sqrt(maxPixels / totalPixels);
      const newWidth = Math.floor(inputMetadata.width * scaleFactor);
      const newHeight = Math.floor(inputMetadata.height * scaleFactor);

      console.log('[Enhance] Image too large for GPU, resizing for processing:', {
        original: `${inputMetadata.width}x${inputMetadata.height}`,
        resized: `${newWidth}x${newHeight}`,
        originalPixels: totalPixels,
        resizedPixels: newWidth * newHeight
      });

      // Resize image
      const resizedBuffer = await sharp(inputBuffer)
        .resize(newWidth, newHeight, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .toBuffer();

      // Upload resized version temporarily
      const tempS3Key = `enhancement-temp/${nanoid()}.jpg`;
      await storage.uploadBuffer(tempS3Key, resizedBuffer, 'image/jpeg');
      processingUrl = await storage.getPresignedGetUrl(tempS3Key, 600);
      resizedForProcessing = true;
    }

    // Step 5: Initialize Replicate provider based on model selection
    const replicateApiKey = process.env.REPLICATE_API_KEY;
    if (!replicateApiKey) {
      throw new Error('REPLICATE_API_KEY environment variable is required');
    }

    // Validate model selection
    if (!['real-esrgan', 'clarity'].includes(model)) {
      throw new Error(`Invalid model: ${model}. Must be 'real-esrgan' or 'clarity'.`);
    }

    let result;

    if (model === 'clarity') {
      // Use Clarity Upscaler (better for text-heavy images)
      const clarityProvider = new ClarityUpscaleProvider({
        apiKey: replicateApiKey
      });

      console.log('[Enhance] Submitting to Clarity Upscaler...');
      result = await clarityProvider.upscaleImage({
        imageUrl: processingUrl,
        scale,
        sharpen: 0,
        creativity: 0.35,
        resemblance: 0.6
      });
    } else {
      // Use Real-ESRGAN (faster but worse with text)
      const replicateProvider = new ReplicateUpscaleProvider({
        apiKey: replicateApiKey
      });

      console.log('[Enhance] Submitting to Real-ESRGAN...');
      result = await replicateProvider.upscaleImage({
        imageUrl: processingUrl,
        scale,
        face_enhance: faceEnhance
      });
    }

    if (!result.success) {
      throw new Error(result.error || 'Upscale failed');
    }

    console.log('[Enhance] Upscale complete, downloading result...');

    // Step 7: Download upscaled image from Replicate
    const upscaledBuffer = await downloadFromUrl(result.imageUrl);
    const upscaledMetadata = await sharp(upscaledBuffer).metadata();

    console.log('[Enhance] Upscaled image metadata:', {
      width: upscaledMetadata.width,
      height: upscaledMetadata.height,
      format: upscaledMetadata.format,
      size: `${(upscaledBuffer.length / 1024).toFixed(2)}KB`
    });

    // Step 8: Upload upscaled image to S3
    const outputS3Key = storage.getEnhancedKey(inputS3Key, scale);
    const contentType = getContentType(upscaledMetadata.format);

    console.log('[Enhance] Uploading upscaled image to S3:', outputS3Key);
    await storage.uploadBuffer(outputS3Key, upscaledBuffer, contentType);

    // Step 9: Generate presigned URL for output
    const outputUrl = await storage.getPresignedGetUrl(outputS3Key, 3600); // 1 hour

    const duration = Date.now() - startTime;

    // Step 10: Build metadata
    const metadata = {
      duration,
      inputSize: inputBuffer.length,
      outputSize: upscaledBuffer.length,
      inputWidth: inputMetadata.width,
      inputHeight: inputMetadata.height,
      outputWidth: upscaledMetadata.width,
      outputHeight: upscaledMetadata.height,
      scaleFactor: scale,
      faceEnhance: model === 'real-esrgan' ? faceEnhance : undefined,
      resizedForProcessing,
      provider: 'replicate',
      model: model,
      cost: 0.024
    };

    // Step 11: Update enhancement record with success
    db.prepare(`
      UPDATE enhancements
      SET output_s3_key = ?,
          status = 'completed',
          cost = 0.024,
          metadata = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(outputS3Key, JSON.stringify(metadata), enhancementId);

    console.log('[Enhance] Enhancement complete:', {
      enhancementId,
      duration: `${duration}ms`,
      inputSize: `${inputMetadata.width}x${inputMetadata.height}`,
      outputSize: `${upscaledMetadata.width}x${upscaledMetadata.height}`,
      cost: '$0.024'
    });

    return {
      success: true,
      enhancementId,
      inputS3Key,
      outputS3Key,
      inputUrl,
      outputUrl,
      metadata
    };

  } catch (error) {
    const duration = Date.now() - startTime;

    console.error('[Enhance] Enhancement failed:', {
      enhancementId,
      error: error.message,
      duration: `${duration}ms`
    });

    // Update enhancement record with failure
    db.prepare(`
      UPDATE enhancements
      SET status = 'failed',
          error = ?,
          metadata = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(error.message, JSON.stringify({ duration }), enhancementId);

    return {
      success: false,
      enhancementId,
      error: error.message,
      metadata: {
        duration
      }
    };
  }
}

/**
 * Get enhancement status and result
 *
 * @param {Object} params
 * @param {string} params.enhancementId - Enhancement ID
 * @param {Object} params.db - Database instance
 * @returns {Promise<Object>} Enhancement status and data
 */
export async function getEnhancement({ enhancementId, db }) {
  try {
    const enhancement = db.prepare(`
      SELECT * FROM enhancements WHERE id = ?
    `).get(enhancementId);

    if (!enhancement) {
      return {
        success: false,
        error: 'Enhancement not found'
      };
    }

    const storage = getStorage();
    let inputUrl = null;
    let outputUrl = null;

    // Generate presigned URLs if keys exist
    if (enhancement.input_s3_key) {
      inputUrl = await storage.getPresignedGetUrl(enhancement.input_s3_key, 3600);
    }

    if (enhancement.output_s3_key) {
      outputUrl = await storage.getPresignedGetUrl(enhancement.output_s3_key, 3600);
    }

    return {
      success: true,
      enhancement: {
        id: enhancement.id,
        status: enhancement.status,
        scaleFactor: enhancement.scale_factor,
        inputS3Key: enhancement.input_s3_key,
        outputS3Key: enhancement.output_s3_key,
        inputUrl,
        outputUrl,
        error: enhancement.error,
        cost: enhancement.cost,
        metadata: enhancement.metadata ? JSON.parse(enhancement.metadata) : null,
        createdAt: enhancement.created_at,
        updatedAt: enhancement.updated_at
      }
    };

  } catch (error) {
    console.error('[Enhance] Get enhancement failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * List all enhancements (paginated)
 *
 * @param {Object} params
 * @param {Object} params.db - Database instance
 * @param {number} params.limit - Max results (default: 50)
 * @param {number} params.offset - Offset for pagination (default: 0)
 * @returns {Promise<Object>} List of enhancements
 */
export async function listEnhancements({ db, limit = 50, offset = 0 }) {
  try {
    const enhancements = db.prepare(`
      SELECT * FROM enhancements
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM enhancements
    `).get().count;

    const storage = getStorage();

    // Generate presigned URLs for each enhancement
    const enhancementsWithUrls = await Promise.all(
      enhancements.map(async (e) => {
        let inputUrl = null;
        let outputUrl = null;

        if (e.input_s3_key) {
          inputUrl = await storage.getPresignedGetUrl(e.input_s3_key, 3600);
        }

        if (e.output_s3_key) {
          outputUrl = await storage.getPresignedGetUrl(e.output_s3_key, 3600);
        }

        return {
          id: e.id,
          status: e.status,
          scaleFactor: e.scale_factor,
          inputS3Key: e.input_s3_key,
          outputS3Key: e.output_s3_key,
          inputUrl,
          outputUrl,
          error: e.error,
          cost: e.cost,
          metadata: e.metadata ? JSON.parse(e.metadata) : null,
          createdAt: e.created_at,
          updatedAt: e.updated_at
        };
      })
    );

    return {
      success: true,
      enhancements: enhancementsWithUrls,
      total,
      limit,
      offset
    };

  } catch (error) {
    console.error('[Enhance] List enhancements failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Download file from URL to buffer
 */
async function downloadFromUrl(url) {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download from URL: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);

  } catch (error) {
    console.error('[Enhance] Download failed:', error.message);
    throw error;
  }
}

/**
 * Get MIME type for image format
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

export default {
  enhanceImage,
  getEnhancement,
  listEnhancements
};
