/**
 * Manifest Generation Workflow (Flow v2)
 *
 * Generates a comprehensive manifest JSON file for each job containing:
 * - All S3 keys and URLs for original, cutout, mask, backgrounds, composites, derivatives
 * - Timing metrics for each pipeline step
 * - Cost breakdown (Freepik API costs)
 * - Metadata (dimensions, file sizes, quality settings)
 */

import { getStorage } from '../storage/index.js';

/**
 * Build manifest for a completed job
 *
 * @param {Object} job - Job record from database
 * @param {Object} pipelineData - Additional pipeline data (derivatives, etc.)
 * @returns {Promise<Object>} Result with manifest S3 key and URL
 */
export async function buildManifest(job, pipelineData = {}) {
  const startTime = Date.now();

  console.log('[Manifest] Building manifest:', {
    jobId: job.id,
    sku: job.sku,
    theme: job.theme
  });

  try {
    const storage = getStorage();

    // Step 1: Build manifest structure
    const manifest = {
      // Metadata
      version: '2.0',
      jobId: job.id,
      sku: job.sku,
      theme: job.theme,
      imgSha256: job.img_sha256,
      status: job.status,
      createdAt: job.created_at,
      completedAt: job.completed_at,
      updatedAt: job.updated_at,

      // Original image
      original: {
        s3Key: job.s3_original_key,
        s3Url: job.s3_original_key ? await storage.getPresignedGetUrl(job.s3_original_key, 86400) : null,
        sourceUrl: job.source_url
      },

      // Background removal (cutout + mask)
      backgroundRemoval: {
        cutout: {
          s3Key: job.s3_cutout_key,
          s3Url: job.s3_cutout_key ? await storage.getPresignedGetUrl(job.s3_cutout_key, 86400) : null
        },
        mask: {
          s3Key: job.s3_mask_key,
          s3Url: job.s3_mask_key ? await storage.getPresignedGetUrl(job.s3_mask_key, 86400) : null
        }
      },

      // AI-generated backgrounds
      backgrounds: await buildBackgroundsList(job, storage),

      // Composites (cutout + background with shadow/centering)
      composites: await buildCompositesList(job, storage),

      // Derivatives (multi-size, multi-format)
      derivatives: pipelineData.derivatives || [],

      // Timing metrics (ms)
      timing: {
        download: job.download_ms || null,
        segmentation: job.segmentation_ms || null,
        backgrounds: job.backgrounds_ms || null,
        compositing: job.compositing_ms || null,
        derivatives: job.derivatives_ms || null,
        manifest: null, // Will be set below
        total: job.completed_at && job.created_at
          ? new Date(job.completed_at) - new Date(job.created_at)
          : null
      },

      // Cost breakdown (Freepik credits)
      costs: {
        segmentation: 0.02, // $0.02 per segmentation
        backgroundGeneration: 0.02 * (job.s3_bg_keys ? JSON.parse(job.s3_bg_keys).length : 0), // $0.02 per background
        total: 0.02 + (0.02 * (job.s3_bg_keys ? JSON.parse(job.s3_bg_keys).length : 0))
      },

      // Provider metadata
      providerMetadata: job.provider_metadata ? JSON.parse(job.provider_metadata) : null,

      // Error information (if failed)
      error: job.error_code ? {
        code: job.error_code,
        message: job.error_message,
        failedAt: job.updated_at
      } : null
    };

    // Step 2: Upload manifest to S3
    const manifestS3Key = storage.getManifestKey(job.sku, job.img_sha256, job.theme);
    const manifestJSON = JSON.stringify(manifest, null, 2);

    await storage.uploadBuffer(manifestS3Key, Buffer.from(manifestJSON), 'application/json');

    // Step 3: Generate presigned URL
    const manifestS3Url = await storage.getPresignedGetUrl(manifestS3Key, 86400); // 24 hours

    const duration = Date.now() - startTime;

    // Update manifest with its own timing
    manifest.timing.manifest = duration;

    // Re-upload with updated timing
    const updatedManifestJSON = JSON.stringify(manifest, null, 2);
    await storage.uploadBuffer(manifestS3Key, Buffer.from(updatedManifestJSON), 'application/json');

    console.log('[Manifest] Manifest built:', {
      jobId: job.id,
      sku: job.sku,
      s3Key: manifestS3Key,
      size: `${(updatedManifestJSON.length / 1024).toFixed(2)}KB`,
      duration: `${duration}ms`
    });

    return {
      success: true,
      s3Key: manifestS3Key,
      s3Url: manifestS3Url,
      manifest,
      metadata: {
        duration,
        size: updatedManifestJSON.length
      }
    };

  } catch (error) {
    const duration = Date.now() - startTime;

    console.error('[Manifest] Build failed:', {
      jobId: job.id,
      sku: job.sku,
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
 * Build backgrounds list with presigned URLs
 */
async function buildBackgroundsList(job, storage) {
  if (!job.s3_bg_keys) {
    return [];
  }

  try {
    const bgKeys = JSON.parse(job.s3_bg_keys);

    const backgrounds = await Promise.all(
      bgKeys.map(async (s3Key, index) => ({
        variant: index + 1,
        s3Key,
        s3Url: await storage.getPresignedGetUrl(s3Key, 86400)
      }))
    );

    return backgrounds;

  } catch (error) {
    console.error('[Manifest] Failed to parse background keys:', error.message);
    return [];
  }
}

/**
 * Build composites list with presigned URLs
 */
async function buildCompositesList(job, storage) {
  if (!job.s3_composite_keys) {
    return [];
  }

  try {
    const compositeKeys = JSON.parse(job.s3_composite_keys);

    const composites = await Promise.all(
      compositeKeys.map(async (s3Key, index) => ({
        variant: index + 1,
        s3Key,
        s3Url: await storage.getPresignedGetUrl(s3Key, 86400)
      }))
    );

    return composites;

  } catch (error) {
    console.error('[Manifest] Failed to parse composite keys:', error.message);
    return [];
  }
}

/**
 * Download and parse existing manifest
 */
export async function getManifest(sku, sha256, theme = 'default') {
  try {
    const storage = getStorage();
    const manifestS3Key = storage.getManifestKey(sku, sha256, theme);

    // Download manifest from S3
    const url = await storage.getPresignedGetUrl(manifestS3Key, 300);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download manifest: ${response.status} ${response.statusText}`);
    }

    const manifestJSON = await response.text();
    const manifest = JSON.parse(manifestJSON);

    console.log('[Manifest] Manifest retrieved:', {
      sku,
      sha256,
      theme,
      s3Key: manifestS3Key
    });

    return {
      success: true,
      manifest,
      s3Key: manifestS3Key
    };

  } catch (error) {
    console.error('[Manifest] Failed to retrieve manifest:', {
      sku,
      sha256,
      theme,
      error: error.message
    });

    return {
      success: false,
      error: error.message
    };
  }
}

export default {
  buildManifest,
  getManifest
};
