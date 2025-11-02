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
// POST /jobs/:id/presign - Generate presigned URLs for specific keys
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
    console.error('[Presign] Error:', error);
    res.status(500).json({ error: 'Failed to generate presigned URLs', details: error.message });
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

export default router;
