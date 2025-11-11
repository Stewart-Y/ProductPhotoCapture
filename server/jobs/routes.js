/**
 * Job API Routes
 *
 * Express routes for job management and webhook handling.
 * All routes are idempotent and safe to retry.
 */

import express from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { z } from 'zod';
import db from '../db.js';
import {
  createJob,
  getJob,
  listJobs,
  updateJobStatus,
  failJob,
  updateJobS3Keys,
  updateJobShopifyMediaIds,
  getJobStats,
  hasReachedImageLimit
} from './manager.js';
import { compositeImage } from '../workflows/composite.js';
import { JobStatus, ErrorCode } from './state-machine.js';
import { verify3JMSWebhook } from './webhook-verify.js';
import getS3Storage from '../storage/s3.js';
import { getProcessorStatus, getProcessorConfig } from '../workflows/processor.js';
import {
  generateBackgroundTemplate,
  regenerateTemplateVariants,
  getTemplateWithAssets,
  refreshTemplateAssetUrls
} from '../workflows/template-generator.js';
import {
  enhanceImage,
  getEnhancement,
  listEnhancements
} from '../workflows/enhance.js';
import {
  findProductBySKU,
  uploadProductImages,
  testConnection as testShopifyConnection
} from '../integrations/shopify.js';

const router = express.Router();
const s3 = getS3Storage();

// =============================================================================
// Validation Schemas
// =============================================================================

/**
 * Webhook payload validation schema
 * Validates incoming webhook requests from 3JMS
 */
const WebhookPayloadSchema = z.object({
  event: z.string().optional(),
  sku: z.string()
    .min(1, 'SKU is required')
    .max(100, 'SKU must be less than 100 characters')
    .regex(/^[a-zA-Z0-9\-_]+$/, 'SKU must contain only alphanumeric characters, hyphens, and underscores'),
  imageUrl: z.string()
    .url('imageUrl must be a valid URL')
    .startsWith('http', 'imageUrl must start with http:// or https://'),
  sha256: z.string()
    .length(64, 'sha256 must be exactly 64 characters')
    .regex(/^[a-f0-9]{64}$/, 'sha256 must be a valid hex string'),
  takenAt: z.string()
    .datetime({ message: 'takenAt must be a valid ISO 8601 datetime' })
    .optional()
});

// Multer middleware for file uploads
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }  // 10MB limit
});

// =============================================================================
// POST /webhooks/3jms/images - Receive 3JMS webhook (idempotent job creation)
// =============================================================================
router.post('/webhooks/3jms/images', verify3JMSWebhook, async (req, res) => {
  try {
    // Validate webhook payload
    const validationResult = WebhookPayloadSchema.safeParse(req.body);

    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }));

      console.error('[Webhook] Validation failed:', errors);
      return res.status(400).json({
        error: 'Invalid webhook payload',
        details: errors
      });
    }

    const { event, sku, imageUrl, sha256, takenAt } = validationResult.data;

    // Check if SKU has reached max images limit
    const maxImages = parseInt(process.env.IMAGE_MAX_PER_SKU || '4', 10);
    if (hasReachedImageLimit(sku, maxImages)) {
      console.warn(`[Webhook] SKU ${sku} has reached max images limit (${maxImages})`);
      return res.status(400).json({
        error: 'Max images limit reached',
        sku,
        maxImages
      });
    }

    // Get theme from query param or use default
    const theme = req.query.theme || process.env.DEFAULT_THEME || 'default';

    // Create job (idempotent)
    const job = createJob({
      sku,
      imageUrl,
      sha256,
      theme
    });

    // Check if job was already created
    const isNew = job.status === JobStatus.NEW;
    const statusCode = isNew ? 201 : 200;

    res.status(statusCode).json({
      jobId: job.id,
      status: isNew ? 'created' : 'duplicate',
      job: {
        id: job.id,
        sku: job.sku,
        theme: job.theme,
        status: job.status,
        createdAt: job.created_at
      }
    });

  } catch (error) {
    console.error('[Webhook] Error:', error);
    res.status(500).json({ error: 'Failed to create job', details: error.message });
  }
});

// =============================================================================
// POST /jobs/:id/start - Start job processing, return presigned URLs
// =============================================================================
router.post('/jobs/:id/start', async (req, res) => {
  try {
    const { id } = req.params;
    const job = getJob(id);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Transition to QUEUED status
    const result = updateJobStatus(id, JobStatus.QUEUED);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Generate presigned URLs for workflow
    const originalKey = s3.getOriginalKey(job.sku, job.img_sha256);
    const maskKey = s3.getMaskKey(job.sku, job.img_sha256);

    const presignedUrls = {
      original: {
        put: await s3.getPresignedPutUrl(originalKey, 'image/jpeg'),
        get: await s3.getPresignedGetUrl(originalKey)
      },
      mask: {
        put: await s3.getPresignedPutUrl(maskKey, 'image/png'),
        get: await s3.getPresignedGetUrl(maskKey)
      }
    };

    // Update job with S3 keys
    updateJobS3Keys(id, { original: originalKey });

    res.json({
      jobId: id,
      status: JobStatus.QUEUED,
      presignedUrls,
      sourceUrl: job.source_url
    });

  } catch (error) {
    console.error('[Job Start] Error:', error);
    res.status(500).json({ error: 'Failed to start job', details: error.message });
  }
});

// =============================================================================
// GET /jobs/stats - Get job statistics (formatted for dashboard)
// =============================================================================
router.get('/jobs/stats', (req, res) => {
  try {
    const stats = getJobStats();

    // Get today's stats
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayJobs = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM jobs
      WHERE created_at >= ? AND created_at < ?
      GROUP BY status
    `).all(today.toISOString(), now.toISOString());

    const todayStats = {
      total: todayJobs.reduce((sum, j) => sum + j.count, 0),
      done: todayJobs.find(j => j.status === 'DONE')?.count || 0,
      failed: todayJobs.find(j => j.status === 'FAILED')?.count || 0
    };

    // Format response for dashboard
    const dashboardStats = {
      today: todayStats,
      cost: {
        avgPerJob24h: stats.total > 0 ? stats.totalCost / stats.total : 0,
        totalMTD: stats.totalCost
      },
      timing: {
        avgProcessingTime: stats.avgDuration || 0
      }
    };

    res.json(dashboardStats);
  } catch (error) {
    console.error('[Job Stats] Error:', error);
    res.status(500).json({ error: 'Failed to get job stats', details: error.message });
  }
});

// =============================================================================
// GET /jobs/:id - Get job status (polling endpoint)
// =============================================================================
router.get('/jobs/:id', (req, res) => {
  try {
    const { id } = req.params;
    const job = getJob(id);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Parse JSON fields
    const response = {
      ...job,
      s3_bg_keys: job.s3_bg_keys ? JSON.parse(job.s3_bg_keys) : null,
      s3_composite_keys: job.s3_composite_keys ? JSON.parse(job.s3_composite_keys) : null,
      s3_thumb_keys: job.s3_thumb_keys ? JSON.parse(job.s3_thumb_keys) : null,
      s3_derivative_keys: job.s3_derivative_keys ? JSON.parse(job.s3_derivative_keys) : null,
      shopify_media_ids: job.shopify_media_ids ? JSON.parse(job.shopify_media_ids) : null
    };

    res.json({ job: response });

  } catch (error) {
    console.error('[Job Get] Error:', error);
    res.status(500).json({ error: 'Failed to get job', details: error.message });
  }
});

// =============================================================================
// GET /jobs/:id/presign - Generate presigned GET URL for viewing assets (Query params)
// =============================================================================
router.get('/jobs/:id/presign', async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.query; // type: 'original', 'cutout', 'mask', 'composite', 'derivative'

    const job = getJob(id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    let key;
    let contentType = 'image/jpeg';

    switch (type) {
      case 'original':
        key = job.s3_original_key;
        break;
      case 'cutout':
        key = job.s3_cutout_key;
        contentType = 'image/png';
        break;
      case 'mask':
        key = job.s3_mask_key;
        contentType = 'image/png';
        break;
      case 'composite':
        // For composites, return the first one if multiple exist
        key = Array.isArray(job.s3_composite_keys) ? job.s3_composite_keys[0] : null;
        break;
      case 'derivative':
        // For derivatives, return the first one if multiple exist
        key = Array.isArray(job.s3_derivative_keys) ? job.s3_derivative_keys[0] : null;
        break;
      default:
        return res.status(400).json({ error: 'Invalid type', validTypes: ['original', 'cutout', 'mask', 'composite', 'derivative'] });
    }

    if (!key) {
      return res.status(404).json({ error: `Asset type '${type}' not found for this job` });
    }

    // Generate presigned GET URL
    const url = await s3.getPresignedGetUrl(key);

    res.json({ url, key });

  } catch (error) {
    console.error('[Presign GET] Error:', error);
    res.status(500).json({ error: 'Failed to generate presigned URL', details: error.message });
  }
});

// =============================================================================
// POST /jobs/:id/presign - Generate presigned URLs for specific keys (Body params)
// =============================================================================
router.post('/jobs/:id/presign', async (req, res) => {
  try {
    const { id } = req.params;
    const { kind, variant = 1, aspect = '1x1', type = 'master' } = req.body;

    const job = getJob(id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    let key;
    let contentType = 'image/jpeg';

    switch (kind) {
      case 'original':
        key = s3.getOriginalKey(job.sku, job.img_sha256);
        break;
      case 'mask':
        key = s3.getMaskKey(job.sku, job.img_sha256);
        contentType = 'image/png';
        break;
      case 'bg':
        key = s3.getBackgroundKey(job.sku, job.img_sha256, job.theme, variant);
        break;
      case 'composite':
        key = s3.getCompositeKey(job.sku, job.img_sha256, job.theme, aspect, variant, type);
        break;
      case 'thumb':
        key = s3.getThumbnailKey(job.sku, job.img_sha256);
        break;
      default:
        return res.status(400).json({ error: 'Invalid kind', validKinds: ['original', 'mask', 'bg', 'composite', 'thumb'] });
    }

    const presignedUrls = {
      put: await s3.getPresignedPutUrl(key, contentType),
      get: await s3.getPresignedGetUrl(key),
      key
    };

    res.json(presignedUrls);

  } catch (error) {
    console.error('[Presign POST] Error:', error);
    res.status(500).json({ error: 'Failed to generate presigned URLs', details: error.message });
  }
});

// =============================================================================
// GET /s3/presign - Generate presigned GET URL for any S3 key (Query params)
// =============================================================================
router.get('/s3/presign', async (req, res) => {
  try {
    const { key } = req.query;

    if (!key) {
      return res.status(400).json({ error: 'Missing required parameter: key' });
    }

    // Generate presigned GET URL for the specified key
    const url = await s3.getPresignedGetUrl(key);

    res.json({ url, key });

  } catch (error) {
    console.error('[S3 Presign] Error:', error);
    res.status(500).json({ error: 'Failed to generate presigned URL', details: error.message });
  }
});

// =============================================================================
// POST /jobs/:id/segmentation - Update with segmentation results
// =============================================================================
router.post('/jobs/:id/segmentation', async (req, res) => {
  try {
    const { id } = req.params;
    const { providerJobId, resultUrl, maskKey } = req.body;

    const job = getJob(id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Update job with mask S3 key
    const updates = {
      segment_job_id: providerJobId
    };

    if (maskKey) {
      updateJobS3Keys(id, { mask: maskKey });
    }

    // Transition to BG_GENERATING
    const result = updateJobStatus(id, JobStatus.BG_GENERATING, updates);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      jobId: id,
      status: JobStatus.BG_GENERATING,
      message: 'Segmentation complete, starting background generation'
    });

  } catch (error) {
    console.error('[Segmentation] Error:', error);
    res.status(500).json({ error: 'Failed to update segmentation', details: error.message });
  }
});

// =============================================================================
// POST /jobs/:id/backgrounds - Update with background generation results
// =============================================================================
router.post('/jobs/:id/backgrounds', async (req, res) => {
  try {
    const { id } = req.params;
    const { bgUrls, bgKeys } = req.body;

    if (!bgKeys || !Array.isArray(bgKeys) || bgKeys.length === 0) {
      return res.status(400).json({ error: 'bgKeys array is required' });
    }

    const job = getJob(id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Update job with background S3 keys
    updateJobS3Keys(id, { backgrounds: bgKeys });

    // Transition to COMPOSITING
    const result = updateJobStatus(id, JobStatus.COMPOSITING);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      jobId: id,
      status: JobStatus.COMPOSITING,
      message: 'Background generation complete, starting compositing'
    });

  } catch (error) {
    console.error('[Backgrounds] Error:', error);
    res.status(500).json({ error: 'Failed to update backgrounds', details: error.message });
  }
});

// =============================================================================
// POST /jobs/:id/composite/run - Actually run the compositing workflow
// =============================================================================
router.post('/jobs/:id/composite/run', async (req, res) => {
  try {
    const { id } = req.params;
    const { options = {} } = req.body;

    const job = getJob(id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Validate job has mask and background
    if (!job.s3_mask_key) {
      return res.status(400).json({ error: 'Job has no mask - run segmentation first' });
    }

    if (!job.s3_bg_keys || job.s3_bg_keys.length === 0) {
      return res.status(400).json({ error: 'Job has no backgrounds - run background generation first' });
    }

    const maskS3Key = job.s3_mask_key;
    const backgroundS3Key = JSON.parse(job.s3_bg_keys)[0]; // Use first background

    console.log('[CompositeRun] Starting composite for job:', id);

    // Run compositing workflow
    const result = await compositeImage({
      maskS3Key,
      backgroundS3Key,
      sku: job.sku,
      sha256: job.img_sha256,
      theme: job.theme,
      variant: 1,
      options
    });

    if (!result.success) {
      // Mark job as failed
      failJob(id, ErrorCode.COMPOSITE_ERROR, result.error);

      return res.status(500).json({
        error: 'Compositing failed',
        details: result.error
      });
    }

    // Update job with composite S3 key
    updateJobS3Keys(id, {
      composites: [result.s3Key]
    });

    // Transition to SHOPIFY_PUSH
    const statusResult = updateJobStatus(id, JobStatus.SHOPIFY_PUSH);

    if (!statusResult.success) {
      return res.status(400).json({ error: statusResult.error });
    }

    res.json({
      jobId: id,
      status: JobStatus.SHOPIFY_PUSH,
      message: 'Compositing complete, ready for Shopify upload',
      composite: {
        s3Key: result.s3Key,
        s3Url: result.s3Url,
        metadata: result.metadata
      }
    });

  } catch (error) {
    console.error('[CompositeRun] Error:', error);
    res.status(500).json({ error: 'Failed to run composite', details: error.message });
  }
});

// =============================================================================
// POST /jobs/:id/composite - Update with compositing results (for manual use)
// =============================================================================
router.post('/jobs/:id/composite', async (req, res) => {
  try {
    const { id } = req.params;
    const { composites, thumbs } = req.body;

    if (!composites || !Array.isArray(composites) || composites.length === 0) {
      return res.status(400).json({ error: 'composites array is required' });
    }

    const job = getJob(id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Update job with composite and thumbnail S3 keys
    updateJobS3Keys(id, {
      composites,
      thumbnails: thumbs || []
    });

    // Transition to SHOPIFY_PUSH
    const result = updateJobStatus(id, JobStatus.SHOPIFY_PUSH);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      jobId: id,
      status: JobStatus.SHOPIFY_PUSH,
      message: 'Compositing complete, ready for Shopify upload'
    });

  } catch (error) {
    console.error('[Composite] Error:', error);
    res.status(500).json({ error: 'Failed to update composite', details: error.message });
  }
});

// =============================================================================
// POST /jobs/:id/shopify - Update with Shopify upload results (marks DONE)
// =============================================================================
router.post('/jobs/:id/shopify', async (req, res) => {
  try {
    const { id } = req.params;
    const { mediaIds } = req.body;

    if (!mediaIds || !Array.isArray(mediaIds) || mediaIds.length === 0) {
      return res.status(400).json({ error: 'mediaIds array is required' });
    }

    const job = getJob(id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Update job with Shopify media IDs and mark as DONE
    const result = updateJobShopifyMediaIds(id, mediaIds);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      jobId: id,
      status: JobStatus.DONE,
      message: 'Job completed successfully',
      mediaIds
    });

  } catch (error) {
    console.error('[Shopify] Error:', error);
    res.status(500).json({ error: 'Failed to update Shopify media', details: error.message });
  }
});

// =============================================================================
// POST /jobs/:id/fail - Mark job as failed
// =============================================================================
router.post('/jobs/:id/fail', (req, res) => {
  try {
    const { id } = req.params;
    const { code, message, stack } = req.body;

    if (!code || !message) {
      return res.status(400).json({ error: 'code and message are required' });
    }

    const job = getJob(id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Fail the job
    const result = failJob(id, code, message, stack);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      jobId: id,
      status: JobStatus.FAILED,
      error: {
        code,
        message
      }
    });

  } catch (error) {
    console.error('[Fail Job] Error:', error);
    res.status(500).json({ error: 'Failed to mark job as failed', details: error.message });
  }
});

// =============================================================================
// GET /jobs - List jobs with filters
// =============================================================================
router.get('/jobs', (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      sku: req.query.sku,
      theme: req.query.theme,
      limit: parseInt(req.query.limit || '100', 10),
      offset: parseInt(req.query.offset || '0', 10)
    };

    const jobs = listJobs(filters);

    res.json({
      jobs,
      count: jobs.length,
      filters
    });

  } catch (error) {
    console.error('[List Jobs] Error:', error);
    res.status(500).json({ error: 'Failed to list jobs', details: error.message });
  }
});

// =============================================================================
// GET /processor/status - Get processor status
// =============================================================================
router.get('/processor/status', (req, res) => {
  try {
    const status = getProcessorStatus();
    res.json(status);
  } catch (error) {
    console.error('[Processor Status] Error:', error);
    res.status(500).json({ error: 'Failed to get processor status', details: error.message });
  }
});

// =============================================================================
// GET /processor/config - Get processor configuration
// =============================================================================
router.get('/processor/config', (req, res) => {
  try {
    const config = getProcessorConfig();
    res.json(config);
  } catch (error) {
    console.error('[Processor Config] Error:', error);
    res.status(500).json({ error: 'Failed to get processor config', details: error.message });
  }
});

// =============================================================================
// POST /upload-test-image - Upload test image for webhook testing
// =============================================================================
router.post('/upload-test-image', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Upload to S3 under test-uploads folder
    const testKey = `test-uploads/${Date.now()}-${req.file.originalname}`;

    await s3.upload(testKey, req.file.buffer, req.file.mimetype);

    // Get presigned URL that's valid for 1 hour
    const url = await s3.getPresignedGetUrl(testKey, 3600);

    console.log(`[TestUpload] ✅ Uploaded test image: ${testKey}`);

    res.status(201).json({
      url: url,
      key: testKey,
      filename: req.file.originalname,
      size: req.file.size
    });

  } catch (error) {
    console.error('[TestUpload] Error:', error);
    res.status(500).json({ error: 'Failed to upload test image', details: error.message });
  }
});

// =============================================================================
// AI Prompt Endpoints - Store and retrieve prompts for cutout and background
// =============================================================================

// In-memory prompt storage (will be replaced with database storage)
let cutoutPrompt = null;
let backgroundPrompt = null;

// Export functions to access prompts from other modules
export function getCutoutPrompt() {
  return cutoutPrompt;
}

export function getBackgroundPrompt() {
  try {
    // First, check if there's a selected custom prompt in settings
    const selectedPromptSetting = db.prepare(`
      SELECT value FROM settings WHERE key = 'selected_prompt_id'
    `).get();

    if (selectedPromptSetting && selectedPromptSetting.value) {
      // Fetch the selected custom prompt from the database
      const customPrompt = db.prepare(`
        SELECT prompt FROM custom_prompts WHERE id = ?
      `).get(selectedPromptSetting.value);

      if (customPrompt) {
        console.log('[getBackgroundPrompt] Using selected custom prompt:', selectedPromptSetting.value);
        return customPrompt.prompt;
      }
    }

    // Fallback: Use the default custom prompt
    const defaultPrompt = db.prepare(`
      SELECT prompt FROM custom_prompts WHERE is_default = 1 LIMIT 1
    `).get();

    if (defaultPrompt) {
      console.log('[getBackgroundPrompt] Using default custom prompt');
      return defaultPrompt.prompt;
    }

    // Final fallback: Use old in-memory variable
    console.log('[getBackgroundPrompt] No custom prompts found, using in-memory fallback');
    return backgroundPrompt;
  } catch (error) {
    console.error('[getBackgroundPrompt] Error fetching custom prompt:', error);
    return backgroundPrompt; // Fallback to old variable
  }
}

// GET /prompts/cutout - Retrieve cutout prompt
router.get('/prompts/cutout', (req, res) => {
  try {
    res.json({ prompt: cutoutPrompt });
  } catch (error) {
    console.error('[Get Cutout Prompt] Error:', error);
    res.status(500).json({ error: 'Failed to get cutout prompt', details: error.message });
  }
});

// POST /prompts/cutout - Save cutout prompt
router.post('/prompts/cutout', (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required and must be a string' });
    }

    cutoutPrompt = prompt.trim();
    console.log(`[Cutout Prompt] Updated: "${cutoutPrompt}"`);

    res.json({
      success: true,
      prompt: cutoutPrompt,
      message: 'Cutout prompt saved successfully'
    });

  } catch (error) {
    console.error('[Save Cutout Prompt] Error:', error);
    res.status(500).json({ error: 'Failed to save cutout prompt', details: error.message });
  }
});

// GET /prompts/background - Retrieve background theme prompt
router.get('/prompts/background', (req, res) => {
  try {
    res.json({ prompt: backgroundPrompt });
  } catch (error) {
    console.error('[Get Background Prompt] Error:', error);
    res.status(500).json({ error: 'Failed to get background prompt', details: error.message });
  }
});

// POST /prompts/background - Save background theme prompt
router.post('/prompts/background', (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required and must be a string' });
    }

    backgroundPrompt = prompt.trim();
    console.log(`[Background Prompt] Updated: "${backgroundPrompt}"`);

    res.json({
      success: true,
      prompt: backgroundPrompt,
      message: 'Background prompt saved successfully'
    });

  } catch (error) {
    console.error('[Save Background Prompt] Error:', error);
    res.status(500).json({ error: 'Failed to save background prompt', details: error.message });
  }
});

// =============================================================================
// Workflow Preference Endpoints - Store and retrieve workflow setting
// =============================================================================

// GET /settings/workflow - Retrieve workflow preference
router.get('/settings/workflow', (req, res) => {
  try {
    const result = db.prepare(`
      SELECT value FROM settings WHERE key = 'workflow_preference'
    `).get();

    const workflow = result?.value || 'cutout_composite';

    res.json({
      workflow,
      options: ['cutout_composite', 'seedream_edit']
    });
  } catch (error) {
    console.error('[Get Workflow] Error:', error);
    res.status(500).json({ error: 'Failed to get workflow preference', details: error.message });
  }
});

// POST /settings/workflow - Save workflow preference
router.post('/settings/workflow', (req, res) => {
  try {
    const { workflow } = req.body;

    if (!workflow || !['cutout_composite', 'seedream_edit'].includes(workflow)) {
      return res.status(400).json({
        error: 'Invalid workflow',
        validValues: ['cutout_composite', 'seedream_edit']
      });
    }

    db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES ('workflow_preference', ?, datetime('now'))
    `).run(workflow);

    console.log(`[Workflow] Updated preference to: ${workflow}`);

    res.json({
      success: true,
      workflow,
      message: 'Workflow preference saved successfully'
    });

  } catch (error) {
    console.error('[Save Workflow] Error:', error);
    res.status(500).json({ error: 'Failed to save workflow preference', details: error.message });
  }
});

// Export function to access workflow preference from other modules
export function getWorkflowPreference() {
  try {
    const result = db.prepare(`
      SELECT value FROM settings WHERE key = 'workflow_preference'
    `).get();
    return result?.value || 'cutout_composite';
  } catch (error) {
    console.error('[Get Workflow Preference] Error:', error);
    return 'cutout_composite'; // Safe fallback
  }
}

// =============================================================================
// AI Compositor Preference Endpoints - Store and retrieve compositor setting
// =============================================================================

// GET /settings/compositor - Retrieve compositor preference
router.get('/settings/compositor', (req, res) => {
  try {
    const result = db.prepare(`
      SELECT value FROM settings WHERE key = 'ai_compositor'
    `).get();

    const compositor = result?.value || process.env.AI_COMPOSITOR || 'freepik';

    res.json({
      compositor,
      options: ['none', 'freepik', 'nanobanana']
    });
  } catch (error) {
    console.error('[Get Compositor] Error:', error);
    res.status(500).json({ error: 'Failed to get compositor preference', details: error.message });
  }
});

// POST /settings/compositor - Save compositor preference
router.post('/settings/compositor', (req, res) => {
  try {
    const { compositor } = req.body;

    if (!compositor || !['freepik', 'nanobanana', 'none'].includes(compositor)) {
      return res.status(400).json({
        error: 'Invalid compositor',
        validValues: ['freepik', 'nanobanana', 'none']
      });
    }

    db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES ('ai_compositor', ?, datetime('now'))
    `).run(compositor);

    console.log(`[Compositor] Updated preference to: ${compositor}`);

    res.json({
      success: true,
      compositor,
      message: 'Compositor preference saved successfully'
    });
  } catch (error) {
    console.error('[Save Compositor] Error:', error);
    res.status(500).json({ error: 'Failed to save compositor preference', details: error.message });
  }
});

// Export function to access compositor preference from other modules
export function getCompositorPreference() {
  try {
    const result = db.prepare(`
      SELECT value FROM settings WHERE key = 'ai_compositor'
    `).get();
    return result?.value || process.env.AI_COMPOSITOR || 'freepik';
  } catch (error) {
    console.error('[Get Compositor Preference] Error:', error);
    return process.env.AI_COMPOSITOR || 'freepik'; // Safe fallback
  }
}

// =============================================================================
// Sharp Workflow Preference Endpoints - Enable full Sharp workflow
// =============================================================================

// GET /settings/sharp-workflow - Retrieve Sharp workflow preference
router.get('/settings/sharp-workflow', (req, res) => {
  try {
    const result = db.prepare(`
      SELECT value FROM settings WHERE key = 'sharp_workflow'
    `).get();

    const enabled = result?.value === 'true' || result?.value === '1';

    res.json({
      enabled,
      description: 'Use template backgrounds + Sharp compositor (no AI, only background removal cost)'
    });
  } catch (error) {
    console.error('[Get Sharp Workflow] Error:', error);
    res.status(500).json({ error: 'Failed to get Sharp workflow preference', details: error.message });
  }
});

// POST /settings/sharp-workflow - Save Sharp workflow preference
router.post('/settings/sharp-workflow', (req, res) => {
  try {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        error: 'enabled must be a boolean'
      });
    }

    db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES ('sharp_workflow', ?, datetime('now'))
    `).run(enabled ? '1' : '0');

    console.log(`[Sharp Workflow] Updated preference to: ${enabled}`);

    res.json({
      success: true,
      enabled,
      message: 'Sharp workflow preference saved successfully'
    });
  } catch (error) {
    console.error('[Save Sharp Workflow] Error:', error);
    res.status(500).json({ error: 'Failed to save Sharp workflow preference', details: error.message });
  }
});

// Export function to access Sharp workflow preference from other modules
export function getSharpWorkflowPreference() {
  try {
    const result = db.prepare(`
      SELECT value FROM settings WHERE key = 'sharp_workflow'
    `).get();
    return result?.value === 'true' || result?.value === '1';
  } catch (error) {
    console.error('[Get Sharp Workflow Preference] Error:', error);
    return false; // Safe fallback - disabled by default
  }
}

// =============================================================================
// Sharp Settings Endpoints - Configure Sharp compositor parameters
// =============================================================================

// GET /settings/sharp-settings - Retrieve Sharp compositor settings
router.get('/settings/sharp-settings', (req, res) => {
  try {
    const result = db.prepare(`
      SELECT value FROM settings WHERE key = 'sharp_settings'
    `).get();

    const defaultSettings = {
      bottleHeightPercent: 0.75,
      quality: 90,
      format: 'jpeg',
      gravity: 'center',
      sharpen: 0,
      gamma: 1.0
    };

    const settings = result?.value ? JSON.parse(result.value) : defaultSettings;

    res.json({
      success: true,
      settings
    });
  } catch (error) {
    console.error('[Get Sharp Settings] Error:', error);
    res.status(500).json({ error: 'Failed to get Sharp settings', details: error.message });
  }
});

// POST /settings/sharp-settings - Save Sharp compositor settings
router.post('/settings/sharp-settings', (req, res) => {
  try {
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({
        error: 'settings object is required'
      });
    }

    // Validate settings
    const {
      bottleHeightPercent,
      quality,
      format,
      gravity,
      sharpen,
      gamma
    } = settings;

    if (typeof bottleHeightPercent !== 'number' || bottleHeightPercent < 0.1 || bottleHeightPercent > 1.0) {
      return res.status(400).json({ error: 'bottleHeightPercent must be between 0.1 and 1.0' });
    }

    if (typeof quality !== 'number' || quality < 60 || quality > 100) {
      return res.status(400).json({ error: 'quality must be between 60 and 100' });
    }

    if (!['jpeg', 'png', 'webp'].includes(format)) {
      return res.status(400).json({ error: 'format must be jpeg, png, or webp' });
    }

    if (!['center', 'north', 'south', 'east', 'west'].includes(gravity)) {
      return res.status(400).json({ error: 'gravity must be center, north, south, east, or west' });
    }

    // Save settings as JSON
    db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES ('sharp_settings', ?, datetime('now'))
    `).run(JSON.stringify(settings));

    console.log('[Sharp Settings] Updated settings:', settings);

    res.json({
      success: true,
      settings,
      message: 'Sharp settings saved successfully'
    });
  } catch (error) {
    console.error('[Save Sharp Settings] Error:', error);
    res.status(500).json({ error: 'Failed to save Sharp settings', details: error.message });
  }
});

// Export function to access Sharp settings from other modules
export function getSharpSettings() {
  try {
    const result = db.prepare(`
      SELECT value FROM settings WHERE key = 'sharp_settings'
    `).get();

    const defaultSettings = {
      bottleHeightPercent: 0.75,
      quality: 90,
      format: 'jpeg',
      gravity: 'center',
      sharpen: 0,
      gamma: 1.0
    };

    return result?.value ? JSON.parse(result.value) : defaultSettings;
  } catch (error) {
    console.error('[Get Sharp Settings] Error:', error);
    return {
      bottleHeightPercent: 0.75,
      quality: 90,
      format: 'jpeg',
      gravity: 'center',
      sharpen: 0,
      gamma: 1.0
    }; // Safe fallback
  }
}

// =============================================================================
// Background Template Endpoints - Manage reusable background templates
// =============================================================================

// GET /templates - List all active templates
router.get('/templates', async (req, res) => {
  try {
    const status = req.query.status || 'active';

    let query = `
      SELECT
        t.*,
        COUNT(a.id) as variant_count
      FROM background_templates t
      LEFT JOIN template_assets a ON t.id = a.template_id
    `;

    if (status && status !== 'all') {
      query += ` WHERE t.status = ?`;
    }

    query += ` GROUP BY t.id ORDER BY t.created_at DESC`;

    const templates = status && status !== 'all'
      ? db.prepare(query).all(status)
      : db.prepare(query).all();

    res.json({
      success: true,
      templates,
      count: templates.length
    });

  } catch (error) {
    console.error('[List Templates] Error:', error);
    res.status(500).json({ error: 'Failed to list templates', details: error.message });
  }
});

// GET /templates/:id - Get specific template with assets
router.get('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const template = getTemplateWithAssets(id, db);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Refresh presigned URLs if expired or close to expiry
    const now = new Date();
    const needsRefresh = template.assets.some(asset => {
      const expiresAt = new Date(asset.s3_url_expires_at);
      const minutesUntilExpiry = (expiresAt - now) / 1000 / 60;
      return minutesUntilExpiry < 10; // Refresh if less than 10 minutes remaining
    });

    if (needsRefresh) {
      await refreshTemplateAssetUrls(id, db);
      // Fetch updated template
      const updatedTemplate = getTemplateWithAssets(id, db);
      return res.json({
        success: true,
        template: updatedTemplate
      });
    }

    res.json({
      success: true,
      template
    });

  } catch (error) {
    console.error('[Get Template] Error:', error);
    res.status(500).json({ error: 'Failed to get template', details: error.message });
  }
});

// POST /templates - Create new template (triggers async generation)
router.post('/templates', async (req, res) => {
  try {
    const { name, customPrompt, variantCount } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Template name is required' });
    }

    if (!customPrompt || typeof customPrompt !== 'string') {
      return res.status(400).json({ error: 'Custom prompt is required' });
    }

    console.log('[Create Template] Starting generation:', { name, customPrompt: customPrompt.substring(0, 50) + '...', variantCount });

    // Create template ID immediately
    const templateId = `tmpl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Insert template record as 'generating'
    db.prepare(`
      INSERT INTO background_templates (id, name, theme, prompt, status, created_at)
      VALUES (?, ?, ?, ?, 'generating', datetime('now'))
    `).run(templateId, name, 'custom', customPrompt);

    // Trigger async generation (don't await - let it run in background)
    generateBackgroundTemplate({
      templateId,
      name,
      theme: 'custom',
      customPrompt,
      variantCount: variantCount || 3,
      db
    }).catch(error => {
      console.error(`[Create Template] Background generation failed for ${templateId}:`, error);
      // Update template status to failed
      db.prepare(`UPDATE background_templates SET status = 'failed', updated_at = datetime('now') WHERE id = ?`).run(templateId);
    });

    // Respond immediately
    res.status(201).json({
      success: true,
      templateId,
      message: 'Template created and generation started in background'
    });

  } catch (error) {
    console.error('[Create Template] Error:', error);
    res.status(500).json({ error: 'Failed to create template', details: error.message });
  }
});

// POST /templates/upload - Upload custom background image
router.post('/templates/upload', upload.single('image'), async (req, res) => {
  try {
    const { title } = req.body;
    const imageFile = req.file;

    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'Template title is required' });
    }

    if (!imageFile) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    console.log('[Upload Template] Starting upload:', {
      title,
      filename: imageFile.originalname,
      size: imageFile.size,
      mimetype: imageFile.mimetype
    });

    // Generate unique template ID
    const templateId = crypto.randomUUID();
    const timestamp = Date.now();

    // Upload to S3 with deterministic key
    const s3Key = `templates/uploaded/${templateId}/background.jpg`;

    console.log('[Upload Template] Uploading to S3:', s3Key);

    await s3.uploadBuffer(s3Key, imageFile.buffer, imageFile.mimetype);

    // Get presigned URL for access
    const s3Url = await s3.getPresignedGetUrl(s3Key, 3600); // 1 hour
    const urlExpiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    // Get image dimensions using sharp (if available)
    let width = 1024;
    let height = 1024;
    try {
      const sharp = (await import('sharp')).default;
      const metadata = await sharp(imageFile.buffer).metadata();
      width = metadata.width || 1024;
      height = metadata.height || 1024;
    } catch (err) {
      console.warn('[Upload Template] Could not read image dimensions:', err.message);
    }

    // Insert template into database
    db.prepare(`
      INSERT INTO background_templates (id, name, theme, prompt, status, created_at, updated_at, used_count)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'), 0)
    `).run(templateId, title, 'uploaded', 'User uploaded background image', 'active');

    // Insert asset into database
    const assetResult = db.prepare(`
      INSERT INTO template_assets (
        template_id, variant, s3_key, s3_url, s3_url_expires_at,
        width, height, format, size_bytes, created_at, selected
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 1)
    `).run(
      templateId,
      1, // variant 1
      s3Key,
      s3Url,
      urlExpiresAt,
      width,
      height,
      imageFile.mimetype.split('/')[1] || 'jpeg',
      imageFile.size,
    );

    console.log('[Upload Template] Template created:', {
      templateId,
      title,
      s3Key,
      assetId: assetResult.lastInsertRowid
    });

    res.status(201).json({
      success: true,
      templateId,
      message: 'Background template uploaded successfully',
      template: {
        id: templateId,
        name: title,
        theme: 'uploaded',
        status: 'active',
        variant_count: 1
      }
    });

  } catch (error) {
    console.error('[Upload Template] Error:', error);
    res.status(500).json({ error: 'Failed to upload template', details: error.message });
  }
});

// PUT /templates/:id - Update template metadata
router.put('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, status } = req.body;

    // Check if template exists
    const template = db.prepare(`
      SELECT * FROM background_templates WHERE id = ?
    `).get(id);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Build update query
    const updates = [];
    const values = [];

    if (name && typeof name === 'string') {
      updates.push('name = ?');
      values.push(name);
    }

    if (status && ['active', 'archived'].includes(status)) {
      updates.push('status = ?');
      values.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.push('updated_at = datetime(\'now\')');
    values.push(id);

    db.prepare(`
      UPDATE background_templates
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values);

    console.log(`[Update Template] Updated template ${id}:`, { name, status });

    res.json({
      success: true,
      message: 'Template updated successfully'
    });

  } catch (error) {
    console.error('[Update Template] Error:', error);
    res.status(500).json({ error: 'Failed to update template', details: error.message });
  }
});

// DELETE /templates/:id - Archive template
router.delete('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if template exists
    const template = db.prepare(`
      SELECT * FROM background_templates WHERE id = ?
    `).get(id);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Archive instead of delete (soft delete)
    db.prepare(`
      UPDATE background_templates
      SET status = 'archived', updated_at = datetime('now')
      WHERE id = ?
    `).run(id);

    console.log(`[Delete Template] Archived template ${id}`);

    res.json({
      success: true,
      message: 'Template archived successfully'
    });

  } catch (error) {
    console.error('[Delete Template] Error:', error);
    res.status(500).json({ error: 'Failed to delete template', details: error.message });
  }
});

// POST /templates/:id/regenerate - Generate additional variants for existing template
router.post('/templates/:id/regenerate', async (req, res) => {
  try {
    const { id } = req.params;
    const { variantCount } = req.body;

    const result = await regenerateTemplateVariants({
      templateId: id,
      variantCount: variantCount || 3,
      db
    });

    if (!result.success) {
      return res.status(500).json({
        error: 'Variant regeneration failed',
        details: result.error
      });
    }

    res.json({
      success: true,
      message: 'Variants generated successfully',
      result
    });

  } catch (error) {
    console.error('[Regenerate Variants] Error:', error);
    res.status(500).json({ error: 'Failed to regenerate variants', details: error.message });
  }
});

// GET /settings/active-template - Get active background template
router.get('/settings/active-template', async (req, res) => {
  try {
    const result = db.prepare(`
      SELECT value FROM settings WHERE key = 'active_background_template'
    `).get();

    const templateId = result?.value || null;

    if (!templateId) {
      return res.json({
        success: true,
        activeTemplate: null
      });
    }

    // Fetch template details
    const template = getTemplateWithAssets(templateId, db);

    res.json({
      success: true,
      activeTemplate: template
    });

  } catch (error) {
    console.error('[Get Active Template] Error:', error);
    res.status(500).json({ error: 'Failed to get active template', details: error.message });
  }
});

// POST /settings/active-template - Set active background template
router.post('/settings/active-template', async (req, res) => {
  try {
    const { templateId } = req.body;

    // Validate templateId if provided (null is allowed to clear)
    if (templateId) {
      const template = db.prepare(`
        SELECT * FROM background_templates WHERE id = ? AND status = 'active'
      `).get(templateId);

      if (!template) {
        return res.status(404).json({ error: 'Template not found or not active' });
      }
    }

    // Update setting (use empty string instead of NULL to avoid NOT NULL constraint)
    db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES ('active_background_template', ?, datetime('now'))
    `).run(templateId || '');

    console.log(`[Active Template] Set to: ${templateId || 'none'}`);

    res.json({
      success: true,
      templateId,
      message: 'Active template updated successfully'
    });

  } catch (error) {
    console.error('[Set Active Template] Error:', error);
    res.status(500).json({ error: 'Failed to set active template', details: error.message });
  }
});

// Export function to access active template from other modules
export function getActiveBackgroundTemplate() {
  try {
    const result = db.prepare(`
      SELECT value FROM settings WHERE key = 'active_background_template'
    `).get();

    const templateId = result?.value;
    // Empty string means no active template
    if (!templateId || templateId === '') {
      return null;
    }

    // Return the full template object
    const template = db.prepare(`
      SELECT * FROM background_templates WHERE id = ? AND status = 'active'
    `).get(templateId);

    return template || null;
  } catch (error) {
    console.error('[Get Active Background Template] Error:', error);
    return null;
  }
}

// ============================================================================
// Custom Prompts API
// ============================================================================

/**
 * GET /api/custom-prompts
 * List all custom prompt presets
 */
router.get('/custom-prompts', async (req, res) => {
  try {
    const prompts = db.prepare(`
      SELECT * FROM custom_prompts
      ORDER BY is_default DESC, title ASC
    `).all();

    res.json({
      success: true,
      prompts
    });
  } catch (error) {
    console.error('[List Custom Prompts] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/custom-prompts
 * Create a new custom prompt preset
 */
router.post('/custom-prompts', async (req, res) => {
  try {
    const { title, prompt } = req.body;

    if (!title || !prompt) {
      return res.status(400).json({
        success: false,
        error: 'Title and prompt are required'
      });
    }

    // Generate unique ID
    const id = `prompt_${crypto.randomBytes(8).toString('hex')}`;

    // Insert new prompt
    db.prepare(`
      INSERT INTO custom_prompts (id, title, prompt, is_default, created_at)
      VALUES (?, ?, ?, 0, datetime('now'))
    `).run(id, title, prompt);

    // Fetch the created prompt
    const newPrompt = db.prepare(`
      SELECT * FROM custom_prompts WHERE id = ?
    `).get(id);

    res.json({
      success: true,
      prompt: newPrompt
    });
  } catch (error) {
    console.error('[Create Custom Prompt] Error:', error);

    // Handle unique constraint violation
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({
        success: false,
        error: 'A prompt with this title already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/custom-prompts/:id
 * Delete a custom prompt preset (only non-default prompts)
 */
router.delete('/custom-prompts/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if prompt exists and is not default
    const prompt = db.prepare(`
      SELECT * FROM custom_prompts WHERE id = ?
    `).get(id);

    if (!prompt) {
      return res.status(404).json({
        success: false,
        error: 'Prompt not found'
      });
    }

    if (prompt.is_default) {
      return res.status(403).json({
        success: false,
        error: 'Cannot delete default prompts'
      });
    }

    // Delete the prompt
    db.prepare(`
      DELETE FROM custom_prompts WHERE id = ?
    `).run(id);

    res.json({
      success: true
    });
  } catch (error) {
    console.error('[Delete Custom Prompt] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PATCH /api/custom-prompts/:id
 * Update a custom prompt preset (only non-default prompts)
 */
router.patch('/custom-prompts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, prompt } = req.body;

    // Check if prompt exists and is not default
    const existingPrompt = db.prepare(`
      SELECT * FROM custom_prompts WHERE id = ?
    `).get(id);

    if (!existingPrompt) {
      return res.status(404).json({
        success: false,
        error: 'Prompt not found'
      });
    }

    if (existingPrompt.is_default) {
      return res.status(403).json({
        success: false,
        error: 'Cannot edit default prompts'
      });
    }

    // Update the prompt
    db.prepare(`
      UPDATE custom_prompts
      SET title = COALESCE(?, title),
          prompt = COALESCE(?, prompt),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(title || null, prompt || null, id);

    // Fetch updated prompt
    const updatedPrompt = db.prepare(`
      SELECT * FROM custom_prompts WHERE id = ?
    `).get(id);

    res.json({
      success: true,
      prompt: updatedPrompt
    });
  } catch (error) {
    console.error('[Update Custom Prompt] Error:', error);

    // Handle unique constraint violation
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({
        success: false,
        error: 'A prompt with this title already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/settings/selected-prompt
 * Save which custom prompt is currently selected
 */
router.post('/settings/selected-prompt', async (req, res) => {
  try {
    const { promptId } = req.body;

    if (!promptId || typeof promptId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Prompt ID is required'
      });
    }

    // Verify the prompt exists
    const prompt = db.prepare(`
      SELECT id FROM custom_prompts WHERE id = ?
    `).get(promptId);

    if (!prompt) {
      return res.status(404).json({
        success: false,
        error: 'Prompt not found'
      });
    }

    // Save selected prompt ID to settings
    db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES ('selected_prompt_id', ?, datetime('now'))
    `).run(promptId);

    console.log('[Settings] Selected prompt updated:', promptId);

    res.json({
      success: true,
      promptId
    });

  } catch (error) {
    console.error('[Save Selected Prompt] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/settings/selected-prompt
 * Get which custom prompt is currently selected
 */
router.get('/settings/selected-prompt', async (req, res) => {
  try {
    const result = db.prepare(`
      SELECT value FROM settings WHERE key = 'selected_prompt_id'
    `).get();

    const promptId = result?.value || null;

    res.json({
      success: true,
      promptId
    });

  } catch (error) {
    console.error('[Get Selected Prompt] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PATCH /api/templates/:templateId/variants/:variantId/toggle
 * Toggle variant selection (selected true/false)
 */
router.patch('/templates/:templateId/variants/:variantId/toggle', async (req, res) => {
  try {
    const { templateId, variantId } = req.params;

    // Get current selection state
    const asset = db.prepare(`
      SELECT id, selected FROM template_assets
      WHERE template_id = ? AND id = ?
    `).get(templateId, variantId);

    if (!asset) {
      return res.status(404).json({
        success: false,
        error: 'Variant not found'
      });
    }

    // Toggle selection
    const newState = asset.selected ? 0 : 1;
    db.prepare(`
      UPDATE template_assets
      SET selected = ?
      WHERE id = ?
    `).run(newState, variantId);

    res.json({
      success: true,
      selected: newState === 1
    });

  } catch (error) {
    console.error('[API] Failed to toggle variant selection:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =============================================================================
// Image Enhancement (Upscaling) Routes
// =============================================================================

// Configure multer for enhancement image uploads
const uploadForEnhancement = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

/**
 * POST /api/upload-for-enhancement
 * Upload an image file to S3 for enhancement
 *
 * Form data:
 * - file: image file
 *
 * Returns:
 * {
 *   "success": true,
 *   "s3Key": "enhancement-uploads/abc123.jpg",
 *   "url": "https://..."
 * }
 */
router.post('/upload-for-enhancement', uploadForEnhancement.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const file = req.file;
    const fileExt = file.originalname.split('.').pop() || 'jpg';
    const fileName = `${crypto.randomBytes(16).toString('hex')}.${fileExt}`;
    const s3Key = `enhancement-uploads/${fileName}`;

    console.log('[API/Upload] Uploading file for enhancement:', {
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      s3Key
    });

    // Upload to S3
    await s3.uploadBuffer(s3Key, file.buffer, file.mimetype);

    // Generate presigned URL
    const url = await s3.getPresignedGetUrl(s3Key, 3600);

    res.json({
      success: true,
      s3Key,
      url
    });

  } catch (error) {
    console.error('[API/Upload] Upload failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/enhance
 * Enhance (upscale) an image using AI (Real-ESRGAN)
 *
 * Body:
 * {
 *   "inputS3Key": "originals/SKU123/abc123.jpg",
 *   "scale": 4,              // 2, 4, or 8
 *   "faceEnhance": false     // optional
 * }
 */
router.post('/enhance', async (req, res) => {
  try {
    const { inputS3Key, scale = 4, faceEnhance = false, model = 'clarity' } = req.body;

    // Validate input
    if (!inputS3Key) {
      return res.status(400).json({
        success: false,
        error: 'inputS3Key is required'
      });
    }

    if (![2, 4, 8].includes(scale)) {
      return res.status(400).json({
        success: false,
        error: 'scale must be 2, 4, or 8'
      });
    }

    if (!['real-esrgan', 'clarity'].includes(model)) {
      return res.status(400).json({
        success: false,
        error: 'model must be "real-esrgan" or "clarity"'
      });
    }

    console.log('[API/Enhance] Starting enhancement:', { inputS3Key, scale, faceEnhance, model });

    // Call enhancement workflow
    const result = await enhanceImage({
      inputS3Key,
      scale,
      faceEnhance,
      model,
      db
    });

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('[API/Enhance] Enhancement failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/enhance/:enhancementId
 * Get enhancement status and result
 */
router.get('/enhance/:enhancementId', async (req, res) => {
  try {
    const { enhancementId } = req.params;

    const result = await getEnhancement({
      enhancementId,
      db
    });

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('[API/Enhance] Get enhancement failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/enhance
 * List all enhancements (paginated)
 *
 * Query params:
 * - limit: number (default: 50)
 * - offset: number (default: 0)
 */
router.get('/enhance', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    const offset = parseInt(req.query.offset || '0', 10);

    const result = await listEnhancements({
      db,
      limit,
      offset
    });

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('[API/Enhance] List enhancements failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =============================================================================
// SHOPIFY INTEGRATION
// =============================================================================

/**
 * POST /api/jobs/:id/push-shopify
 * Manually push completed job images to Shopify
 * Used for testing and manual triggers from UI
 */
router.post('/jobs/:id/push-shopify', async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`[Shopify Push] Manual trigger for job ${id}`);

    // Get job details
    const job = getJob(id);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    // Ensure job is completed
    if (job.status !== JobStatus.DONE && job.status !== JobStatus.DERIVATIVES) {
      return res.status(400).json({
        success: false,
        error: `Job must be in DONE or DERIVATIVES status. Current status: ${job.status}`
      });
    }

    // Check if already pushed to Shopify
    if (job.shopify_media_ids && JSON.parse(job.shopify_media_ids).length > 0) {
      console.log(`[Shopify Push] Job ${id} already pushed to Shopify`);
      return res.json({
        success: true,
        message: 'Images already pushed to Shopify',
        shopify_product_id: job.shopify_product_id,
        shopify_media_ids: JSON.parse(job.shopify_media_ids)
      });
    }

    // Find Shopify product by SKU
    console.log(`[Shopify Push] Looking up Shopify product for SKU: ${job.sku}`);
    const product = await findProductBySKU(job.sku, db);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: `No Shopify product found for SKU: ${job.sku}. Please ensure the product exists in Shopify and has the correct SKU.`
      });
    }

    // Get composite image URLs from S3
    const compositeKeys = job.s3_composite_keys ? JSON.parse(job.s3_composite_keys) : [];

    if (compositeKeys.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No composite images found for this job'
      });
    }

    // Generate presigned URLs for composites
    console.log(`[Shopify Push] Generating presigned URLs for ${compositeKeys.length} images`);
    const imageUrls = await Promise.all(
      compositeKeys.map(key => s3.getPresignedUrl(key, 3600)) // 1 hour expiry
    );

    // Upload images to Shopify
    console.log(`[Shopify Push] Uploading ${imageUrls.length} images to Shopify product ${product.productId}`);
    const uploadResults = await uploadProductImages(
      product.productId,
      imageUrls,
      `${job.sku} - ${job.theme || 'Enhanced'}`
    );

    // Extract successful media IDs
    const mediaIds = uploadResults
      .filter(r => !r.error && r.id)
      .map(r => r.id);

    if (mediaIds.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'Failed to upload any images to Shopify',
        details: uploadResults
      });
    }

    // Update job with Shopify info
    db.prepare(`
      UPDATE jobs
      SET shopify_product_id = ?,
          shopify_media_ids = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(product.productId, JSON.stringify(mediaIds), id);

    console.log(`[Shopify Push] Successfully pushed ${mediaIds.length} images to Shopify for job ${id}`);

    res.json({
      success: true,
      message: `Successfully uploaded ${mediaIds.length} images to Shopify`,
      shopify_product_id: product.productId,
      shopify_media_ids: mediaIds,
      product_title: product.title,
      product_handle: product.handle,
      upload_results: uploadResults
    });

  } catch (error) {
    console.error('[Shopify Push] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/shopify/product/:sku
 * Test endpoint to lookup Shopify product by SKU
 */
router.get('/shopify/product/:sku', async (req, res) => {
  try {
    const { sku } = req.params;

    console.log(`[Shopify Lookup] Finding product for SKU: ${sku}`);

    const product = await findProductBySKU(sku, db);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: `No product found for SKU: ${sku}`
      });
    }

    res.json({
      success: true,
      product
    });

  } catch (error) {
    console.error('[Shopify Lookup] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/shopify/test
 * Test Shopify API connection
 */
router.get('/shopify/test', async (req, res) => {
  try {
    const result = await testShopifyConnection();

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('[Shopify Test] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
