/**
 * Job API Routes
 *
 * Express routes for job management and webhook handling.
 * All routes are idempotent and safe to retry.
 */

import express from 'express';
import crypto from 'crypto';
import multer from 'multer';
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

const router = express.Router();
const s3 = getS3Storage();

// Multer middleware for file uploads
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }  // 10MB limit
});

// =============================================================================
// POST /webhooks/3jms/images - Receive 3JMS webhook (idempotent job creation)
// =============================================================================
router.post('/webhooks/3jms/images', verify3JMSWebhook, async (req, res) => {
  try {
    const { event, sku, imageUrl, sha256, takenAt } = req.body;

    // Validate required fields
    if (!sku || !imageUrl || !sha256) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['sku', 'imageUrl', 'sha256']
      });
    }

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
  return backgroundPrompt;
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

    // Trigger async generation (don't await - let it run in background)
    const result = await generateBackgroundTemplate({
      name,
      theme: 'custom',
      customPrompt,
      variantCount: variantCount || 3,
      db
    });

    if (!result.success) {
      return res.status(500).json({
        error: 'Template generation failed',
        details: result.error
      });
    }

    res.status(201).json({
      success: true,
      templateId: result.templateId,
      message: 'Template created and generation started',
      result
    });

  } catch (error) {
    console.error('[Create Template] Error:', error);
    res.status(500).json({ error: 'Failed to create template', details: error.message });
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

export default router;
