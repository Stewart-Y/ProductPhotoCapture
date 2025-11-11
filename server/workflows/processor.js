/**
 * Job Processor - Background Worker (Flow v2)
 *
 * Automatically processes jobs through the complete 7-step pipeline:
 * NEW → BG_REMOVED → BACKGROUND_READY → COMPOSITED → DERIVATIVES → SHOPIFY_PUSH → DONE
 *
 * Features:
 * - Automatic state progression with proper state machine validation
 * - Timing metrics for each step
 * - Cost tracking (Freepik API)
 * - Retry logic with exponential backoff
 * - Error handling and logging
 * - Graceful shutdown
 */

import { getJob, listJobs, failJob } from '../jobs/manager.js';
import { JobStatus, ErrorCode } from '../jobs/state-machine.js';
import { getSegmentProvider, getBackgroundProvider, getSeedreamProvider } from '../providers/index.js';
import { compositeImage } from './composite.js';
import { FreepikCompositeProvider } from '../providers/freepik/composite.js';
import { NanoBananaCompositeProvider } from '../providers/nanobanana/composite.js';
import { generateDerivatives, batchGenerateDerivatives } from './derivatives.js';
import { buildManifest } from './manifest.js';
import { getBackgroundPrompt, getWorkflowPreference, getActiveBackgroundTemplate, getCompositorPreference, getSharpWorkflowPreference, getSharpSettings } from '../jobs/routes.js';
import { getTemplateWithAssets } from './template-generator.js';
import { findProductBySKU, uploadProductImages } from '../integrations/shopify.js';
import getS3Storage from '../storage/s3.js';
import db from '../db.js';

/**
 * Get compositor instance based on configuration
 * Priority: Sharp Workflow + Flux Kontext > Sharp Workflow > Compositor Preference > Environment Variable
 */
function getCompositor() {
  // Check if Sharp Workflow is enabled
  const sharpWorkflowEnabled = getSharpWorkflowPreference();
  const compositorPreference = getCompositorPreference();

  // COMBINED FLOW: Sharp Workflow + Freepik Seedream = Sharp composite + Seedream lighting
  if (sharpWorkflowEnabled && compositorPreference === 'freepik') {
    console.log('[Processor] 🎯 COMBINED FLOW: Sharp Workflow + Freepik Seedream');
    console.log('[Processor] → Sharp composite (pixel-perfect) + Seedream lighting enhancement');

    const sharpSettings = getSharpSettings();
    const seedreamProvider = getSeedreamProvider();

    // Return a wrapper that combines Sharp + Seedream
    return {
      compositeImage: async (params) => {
        console.log('[Processor] Step 1/2: Sharp compositing...');

        // Step 1: Sharp composite (pixel-perfect)
        const sharpResult = await compositeImage({
          maskS3Key: params.cutoutS3Key,
          backgroundS3Key: params.backgroundS3Key,
          sku: params.sku,
          sha256: params.sha256,
          theme: params.theme,
          variant: params.variant,
          options: {
            ...sharpSettings,
            ...params.options
          }
        });

        if (!sharpResult.success) {
          return {
            success: false,
            error: sharpResult.error,
            metadata: sharpResult.metadata,
            cost: 0
          };
        }

        console.log('[Processor] Step 2/2: Seedream lighting enhancement...');

        // Step 2: Seedream lighting enhancement (uses Sharp composite as input)
        const seedreamResult = await seedreamProvider.enhanceLighting({
          compositeS3Key: sharpResult.s3Key,
          sku: params.sku,
          sha256: params.sha256,
          theme: params.theme,
          variant: params.variant
        });

        // Return combined result
        return {
          success: seedreamResult.success,
          s3Key: seedreamResult.s3Key,
          s3Url: seedreamResult.s3Url,
          error: seedreamResult.error,
          metadata: {
            ...seedreamResult.metadata,
            sharpCompositeS3Key: sharpResult.s3Key,
            combinedFlow: true,
            sharpDuration: sharpResult.metadata?.duration,
            seedreamDuration: seedreamResult.metadata?.duration
          },
          cost: seedreamResult.cost // $0.08 for Seedream Edit
        };
      }
    };
  }

  // COMBINED FLOW: Sharp Workflow + Nano Banana = Sharp composite + Nano Banana lighting
  if (sharpWorkflowEnabled && compositorPreference === 'nanobanana') {
    console.log('[Processor] 🎯 COMBINED FLOW: Sharp Workflow + Nano Banana');
    console.log('[Processor] → Sharp composite (pixel-perfect) + Nano Banana lighting enhancement');

    const sharpSettings = getSharpSettings();
    const nanoBananaProvider = new NanoBananaCompositeProvider({
      apiKey: process.env.NANOBANANA_API_KEY
    });

    // Return a wrapper that combines Sharp + Nano Banana
    return {
      compositeImage: async (params) => {
        console.log('[Processor] Step 1/2: Sharp compositing...');

        // Step 1: Sharp composite (pixel-perfect)
        const sharpResult = await compositeImage({
          maskS3Key: params.cutoutS3Key,
          backgroundS3Key: params.backgroundS3Key,
          sku: params.sku,
          sha256: params.sha256,
          theme: params.theme,
          variant: params.variant,
          options: {
            ...sharpSettings,
            ...params.options
          }
        });

        if (!sharpResult.success) {
          return {
            success: false,
            error: sharpResult.error,
            metadata: sharpResult.metadata,
            cost: 0
          };
        }

        console.log('[Processor] Step 2/2: Nano Banana lighting enhancement...');

        // Step 2: Nano Banana lighting enhancement (uses Sharp composite as input)
        const nanoBananaResult = await nanoBananaProvider.enhanceLighting({
          compositeS3Key: sharpResult.s3Key,
          sku: params.sku,
          sha256: params.sha256,
          theme: params.theme,
          variant: params.variant
        });

        // Return combined result
        return {
          success: nanoBananaResult.success,
          s3Key: nanoBananaResult.s3Key,
          s3Url: nanoBananaResult.s3Url,
          error: nanoBananaResult.error,
          metadata: {
            ...nanoBananaResult.metadata,
            sharpCompositeS3Key: sharpResult.s3Key,
            combinedFlow: true,
            sharpDuration: sharpResult.metadata?.duration,
            nanobananaDuration: nanoBananaResult.metadata?.duration
          },
          cost: nanoBananaResult.cost // $0.03 for Nano Banana
        };
      }
    };
  }

  // SHARP ONLY: Sharp Workflow without AI enhancement (OR compositor is 'none')
  if (sharpWorkflowEnabled || compositorPreference === 'none') {
    const reason = sharpWorkflowEnabled
      ? 'Sharp Workflow ENABLED'
      : 'Compositor set to "none"';

    console.log(`[Processor] 🎯 ${reason} - using Sharp compositor (pixel-perfect, no AI)`);

    // Get saved Sharp settings
    const sharpSettings = getSharpSettings();

    // Return a wrapper that adapts the Sharp workflow to the compositor interface
    return {
      compositeImage: async (params) => {
        // Merge saved settings with passed options (passed options take priority)
        const mergedOptions = {
          ...sharpSettings,
          ...params.options
        };

        console.log('[Processor] Using Sharp settings:', mergedOptions);

        // Adapt parameters from AI compositor format to Sharp workflow format
        const result = await compositeImage({
          maskS3Key: params.cutoutS3Key,
          backgroundS3Key: params.backgroundS3Key,
          sku: params.sku,
          sha256: params.sha256,
          theme: params.theme,
          variant: params.variant,
          options: mergedOptions
        });

        // Return in AI compositor format
        return {
          success: result.success,
          s3Key: result.s3Key,
          s3Url: result.s3Url,
          error: result.error,
          metadata: result.metadata,
          cost: 0 // Sharp is free
        };
      }
    };
  }

  // If Sharp Workflow is NOT enabled, check compositor preference
  const compositor = compositorPreference;

  if (compositor === 'sharp') {
    console.log('[Processor] Using Sharp compositor (pixel-perfect, no AI regeneration)');
    // Return a wrapper that adapts the Sharp workflow to the compositor interface
    return {
      compositeImage: async (params) => {
        // Adapt parameters from AI compositor format to Sharp workflow format
        const result = await compositeImage({
          maskS3Key: params.cutoutS3Key,
          backgroundS3Key: params.backgroundS3Key,
          sku: params.sku,
          sha256: params.sha256,
          theme: params.theme,
          variant: params.variant,
          options: params.options
        });

        // Return in AI compositor format
        return {
          success: result.success,
          s3Key: result.s3Key,
          s3Url: result.s3Url,
          error: result.error,
          metadata: result.metadata,
          cost: 0 // Sharp is free
        };
      }
    };
  }

  if (compositor === 'nanobanana') {
    console.log('[Processor] Using Nano Banana compositor (AI with better text preservation)');
    return new NanoBananaCompositeProvider({
      apiKey: process.env.NANOBANANA_API_KEY
    });
  }

  console.log('[Processor] Using Freepik Seedream compositor (AI generative)');
  return new FreepikCompositeProvider({
    apiKey: process.env.FREEPIK_API_KEY
  });
}

/**
 * Job Processor Configuration
 */
const CONFIG = {
  pollInterval: parseInt(process.env.JOB_POLL_INTERVAL_MS || '5000', 10), // 5 seconds
  concurrency: parseInt(process.env.JOB_CONCURRENCY || '1', 10), // Process 1 job at a time
  maxRetries: parseInt(process.env.JOB_MAX_RETRIES || '3', 10),
  retryDelay: parseInt(process.env.JOB_RETRY_DELAY_MS || '60000', 10), // 1 minute
};

/**
 * Processor State
 */
let isRunning = false;
let pollTimer = null;
let currentJobs = new Set(); // Track jobs being processed

/**
 * Start the job processor
 */
export function startProcessor() {
  if (isRunning) {
    console.log('[Processor] Already running');
    return;
  }

  isRunning = true;
  console.log('[Processor] Starting job processor (Flow v2)', {
    pollInterval: `${CONFIG.pollInterval}ms`,
    concurrency: CONFIG.concurrency,
    maxRetries: CONFIG.maxRetries
  });

  // Start polling loop
  pollForJobs();
}

/**
 * Stop the job processor
 */
export function stopProcessor() {
  if (!isRunning) {
    console.log('[Processor] Not running');
    return;
  }

  console.log('[Processor] Stopping job processor...');
  isRunning = false;

  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }

  console.log('[Processor] Stopped');
}

/**
 * Poll for jobs to process
 */
async function pollForJobs() {
  if (!isRunning) return;

  try {
    // Get jobs that need processing (NEW status in Flow v2)
    const jobs = listJobs({
      status: JobStatus.NEW,
      limit: CONFIG.concurrency - currentJobs.size
    });

    if (jobs.length > 0) {
      console.log(`[Processor] Found ${jobs.length} job(s) to process`);

      for (const job of jobs) {
        // Avoid processing same job twice
        if (currentJobs.has(job.id)) {
          continue;
        }

        currentJobs.add(job.id);

        // Process job asynchronously
        processJob(job.id)
          .catch(error => {
            console.error('[Processor] Unexpected error:', error);
          })
          .finally(() => {
            currentJobs.delete(job.id);
          });
      }
    }

  } catch (error) {
    console.error('[Processor] Poll error:', error);
  }

  // Schedule next poll
  if (isRunning) {
    pollTimer = setTimeout(pollForJobs, CONFIG.pollInterval);
  }
}

/**
 * Process a single job through the complete Flow v2 pipeline
 */
async function processJob(jobId) {
  console.log(`[Processor] [${jobId}] Starting Flow v2 pipeline`);

  const db = (await import('../db.js')).default;

  try {
    let job = getJob(jobId);
    if (!job) {
      console.error(`[Processor] Job not found: ${jobId}`);
      return;
    }

    // Skip if job is already done or failed
    if (job.status === JobStatus.DONE || job.status === JobStatus.FAILED) {
      console.log(`[Processor] [${jobId}] Already in terminal state: ${job.status}`);
      return;
    }

    // ========================================
    // WORKFLOW SELECTION
    // ========================================
    const workflowType = getWorkflowPreference();
    console.log(`[Processor] [${jobId}] Using workflow: ${workflowType}`);

    // Store workflow type in job record
    db.prepare(`
      UPDATE jobs SET workflow_type = ? WHERE id = ?
    `).run(workflowType, jobId);

    // ========================================
    // BRANCH: WORKFLOW A vs WORKFLOW B
    // ========================================
    if (workflowType === 'seedream_edit') {
      await processSeedreamWorkflow(jobId, job, db);
    } else {
      await processCutoutCompositeWorkflow(jobId, job, db);
    }

  } catch (error) {
    console.error(`[Processor] [${jobId}] Pipeline error:`, error);
    failJob(jobId, ErrorCode.UNKNOWN, error.message, error.stack);
  }
}

/**
 * WORKFLOW A: Cutout + Composite (Current - 7 steps)
 * Precise control with background removal, generation, and compositing
 */
async function processCutoutCompositeWorkflow(jobId, job, db) {
  console.log(`[Processor] [${jobId}] 🎯 WORKFLOW A: Cutout + Composite`);

  try {
    // Flow v2 7-Step Pipeline
    // ===================================================

    // Step 1: Download original image from 3JMS + Background Removal
    const step1Start = Date.now();
    console.log(`[Processor] [${jobId}] Step 1/7: Download + Background Removal`);

    const segmentProvider = getSegmentProvider();
    const segmentResult = await segmentProvider.removeBackground({
      imageUrl: job.source_url,
      sku: job.sku,
      sha256: job.img_sha256
    });

    if (!segmentResult.success) {
      throw new Error(`Background removal failed: ${segmentResult.error}`);
    }

    const step1Duration = Date.now() - step1Start;

    console.log(`[Processor] [${jobId}] ✅ Step 1 complete (${step1Duration}ms):`, {
      cutout: segmentResult.cutout.s3Key,
      mask: segmentResult.mask.s3Key,
      cost: `$${segmentResult.cost.toFixed(4)}`
    });

    // Update job: NEW → BG_REMOVED
    db.prepare(`
      UPDATE jobs
      SET status = ?,
          s3_cutout_key = ?,
          s3_mask_key = ?,
          segmentation_ms = ?,
          cost_usd = cost_usd + ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      JobStatus.BG_REMOVED,
      segmentResult.cutout.s3Key,
      segmentResult.mask.s3Key,
      step1Duration,
      segmentResult.cost,
      jobId
    );

    // Step 2: Background Generation (AI-generated backgrounds or template)
    const step2Start = Date.now();
    console.log(`[Processor] [${jobId}] Step 2/7: Background Generation`);

    const backgrounds = [];

    // Check if Sharp workflow is enabled (requires template)
    const sharpWorkflowEnabled = getSharpWorkflowPreference();

    // Check if there's an active background template
    const activeTemplate = getActiveBackgroundTemplate();

    if (sharpWorkflowEnabled && !activeTemplate) {
      // Sharp workflow requires a template to be selected
      throw new Error('Sharp Workflow is enabled but no background template is selected. Please select a template in the Templates tab or disable Sharp Workflow.');
    }

    if (activeTemplate || sharpWorkflowEnabled) {
      // Use pre-generated backgrounds from active template
      console.log(`[Processor] [${jobId}] Using active template: "${activeTemplate.name}" (${activeTemplate.id})${sharpWorkflowEnabled ? ' [Sharp Workflow]' : ''}`);

      const templateData = getTemplateWithAssets(activeTemplate.id, db, true); // onlySelected = true
      if (!templateData || !templateData.assets || templateData.assets.length === 0) {
        throw new Error(`Active template "${activeTemplate.name}" has no selected background variants`);
      }

      // Use template's background S3 keys (only selected variants)
      backgrounds.push(...templateData.assets.map(asset => asset.s3_key));

      // Update job to track which template was used
      db.prepare('UPDATE jobs SET background_template_id = ? WHERE id = ?')
        .run(activeTemplate.id, jobId);

      console.log(`[Processor] [${jobId}] Using ${backgrounds.length} selected backgrounds from template (no generation cost)`);

    } else {
      // No active template and Sharp workflow not enabled - generate new backgrounds per job
      console.log(`[Processor] [${jobId}] No active template - generating new backgrounds`);

      // Get user's custom background theme prompt
      const customPrompt = getBackgroundPrompt();

      // Generate 2 AI backgrounds using Freepik Mystic API
      const backgroundProvider = getBackgroundProvider();

      if (customPrompt) {
        console.log(`[Processor] [${jobId}] Using custom background prompt: "${customPrompt}"`);
      }

      for (let i = 1; i <= 2; i++) {
        console.log(`[Processor] [${jobId}] Generating background ${i}/2 with Freepik Mystic...`);

        const bgResult = await backgroundProvider.generateBackground({
          theme: job.theme,
          sku: job.sku,
          sha256: job.img_sha256,
          dimensions: { width: 1024, height: 1024 },
          aspectRatio: 'square_1_1',
          customPrompt,
          variant: i
        });

        if (!bgResult.success) {
          throw new Error(`Background generation ${i} failed: ${bgResult.error}`);
        }

        backgrounds.push(bgResult.s3Key);

        // Track cost incrementally
        if (bgResult.cost > 0) {
          db.prepare('UPDATE jobs SET cost_usd = cost_usd + ? WHERE id = ?')
            .run(bgResult.cost, jobId);
          console.log(`[Processor] [${jobId}] Background ${i} cost: $${bgResult.cost.toFixed(4)}`);
        }
      }
    }

    const step2Duration = Date.now() - step2Start;

    console.log(`[Processor] [${jobId}] ✅ Step 2 complete (${step2Duration}ms):`, {
      backgrounds: backgrounds.length
    });

    // Update job: BG_REMOVED → BACKGROUND_READY
    db.prepare(`
      UPDATE jobs
      SET status = ?,
          s3_bg_keys = ?,
          backgrounds_ms = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      JobStatus.BACKGROUND_READY,
      JSON.stringify(backgrounds),
      step2Duration,
      jobId
    );

    // Step 3: AI-Powered Compositing
    const step3Start = Date.now();
    const compositorName = process.env.AI_COMPOSITOR || 'freepik';
    console.log(`[Processor] [${jobId}] Step 3/7: AI-Powered Compositing (${compositorName})`);

    job = getJob(jobId); // Refresh job data

    const cutoutS3Key = job.s3_cutout_key;
    const bgS3Keys = JSON.parse(job.s3_bg_keys);

    if (!cutoutS3Key) {
      throw new Error('No cutout available');
    }

    if (bgS3Keys.length === 0) {
      throw new Error('No backgrounds available');
    }

    // Initialize AI Compositor (Freepik Seedream or Nano Banana)
    const aiCompositor = getCompositor();

    // AI composite each background
    const composites = [];
    let totalCompositeCost = 0;

    for (let i = 0; i < bgS3Keys.length; i++) {
      const result = await aiCompositor.compositeImage({
        cutoutS3Key: cutoutS3Key,
        backgroundS3Key: bgS3Keys[i],
        sku: job.sku,
        sha256: job.img_sha256,
        theme: job.theme,
        variant: i + 1,
        options: {
          aspect: '1x1',
          type: 'master'
        }
      });

      if (!result.success) {
        throw new Error(`AI Compositing failed: ${result.error}`);
      }

      composites.push(result.s3Key);
      totalCompositeCost += result.cost || 0;

      // Track cost incrementally
      if (result.cost > 0) {
        db.prepare('UPDATE jobs SET cost_usd = cost_usd + ? WHERE id = ?')
          .run(result.cost, jobId);
        console.log(`[Processor] [${jobId}] AI Composite ${i + 1} cost: $${result.cost.toFixed(4)}`);
      }
    }

    const step3Duration = Date.now() - step3Start;

    console.log(`[Processor] [${jobId}] ✅ Step 3 complete (${step3Duration}ms):`, {
      composites: composites.length
    });

    // Update job: BACKGROUND_READY → COMPOSITED
    db.prepare(`
      UPDATE jobs
      SET status = ?,
          s3_composite_keys = ?,
          compositing_ms = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      JobStatus.COMPOSITED,
      JSON.stringify(composites),
      step3Duration,
      jobId
    );

    // Step 4: Derivatives Generation (multi-size, multi-format)
    const step4Start = Date.now();
    console.log(`[Processor] [${jobId}] Step 4/7: Generating derivatives (9 files per composite)`);

    job = getJob(jobId); // Refresh job data

    const compositeS3Keys = JSON.parse(job.s3_composite_keys);

    const derivativesResult = await batchGenerateDerivatives({
      compositeS3Keys,
      sku: job.sku,
      sha256: job.img_sha256,
      theme: job.theme
    });

    if (!derivativesResult.success) {
      throw new Error('Derivatives generation failed');
    }

    // Flatten all derivative S3 keys
    const allDerivativeKeys = derivativesResult.results
      .flatMap(r => r.derivatives || [])
      .map(d => d.s3Key);

    const step4Duration = Date.now() - step4Start;

    console.log(`[Processor] [${jobId}] ✅ Step 4 complete (${step4Duration}ms):`, {
      totalDerivatives: allDerivativeKeys.length
    });

    // Update job: COMPOSITED → DERIVATIVES
    db.prepare(`
      UPDATE jobs
      SET status = ?,
          s3_derivative_keys = ?,
          derivatives_ms = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      JobStatus.DERIVATIVES,
      JSON.stringify(allDerivativeKeys),
      step4Duration,
      jobId
    );

    // Step 5: Manifest Generation
    const step5Start = Date.now();
    console.log(`[Processor] [${jobId}] Step 5/7: Building manifest`);

    job = getJob(jobId); // Refresh job data

    const manifestResult = await buildManifest(job, {
      derivatives: derivativesResult.results.flatMap(r => r.derivatives || [])
    });

    if (!manifestResult.success) {
      throw new Error(`Manifest generation failed: ${manifestResult.error}`);
    }

    const step5Duration = Date.now() - step5Start;

    console.log(`[Processor] [${jobId}] ✅ Step 5 complete (${step5Duration}ms):`, {
      manifest: manifestResult.s3Key
    });

    // Update job with manifest
    db.prepare(`
      UPDATE jobs
      SET manifest_s3_key = ?,
          manifest_ms = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      manifestResult.s3Key,
      step5Duration,
      jobId
    );

    // Step 6: Shopify Push
    const step6Start = Date.now();
    console.log(`[Processor] [${jobId}] Step 6/7: Shopify Push`);

    try {
      // Check if Shopify is configured
      if (!process.env.SHOPIFY_ACCESS_TOKEN) {
        console.log(`[Processor] [${jobId}] Shopify not configured - skipping push`);
      } else {
        // Find Shopify product by SKU
        console.log(`[Processor] [${jobId}] Looking up Shopify product for SKU: ${job.sku}`);
        const product = await findProductBySKU(job.sku, db);

        if (!product) {
          console.warn(`[Processor] [${jobId}] No Shopify product found for SKU: ${job.sku} - skipping push`);
        } else {
          // Get composite image URLs from S3
          const compositeKeys = job.s3_composite_keys ? JSON.parse(job.s3_composite_keys) : [];

          if (compositeKeys.length > 0) {
            // Generate presigned URLs
            const s3 = getS3Storage();
            const imageUrls = await Promise.all(
              compositeKeys.map(key => s3.getPresignedUrl(key, 3600)) // 1 hour expiry
            );

            // Upload images to Shopify
            console.log(`[Processor] [${jobId}] Uploading ${imageUrls.length} images to Shopify product ${product.productId}`);
            const uploadResults = await uploadProductImages(
              product.productId,
              imageUrls,
              `${job.sku} - ${job.theme || 'Enhanced'}`
            );

            // Extract successful media IDs
            const mediaIds = uploadResults
              .filter(r => !r.error && r.id)
              .map(r => r.id);

            if (mediaIds.length > 0) {
              // Update job with Shopify info
              db.prepare(`
                UPDATE jobs
                SET shopify_product_id = ?,
                    shopify_media_ids = ?,
                    updated_at = datetime('now')
                WHERE id = ?
              `).run(product.productId, JSON.stringify(mediaIds), jobId);

              console.log(`[Processor] [${jobId}] ✅ Pushed ${mediaIds.length} images to Shopify`);
            } else {
              console.warn(`[Processor] [${jobId}] Failed to upload any images to Shopify`);
            }
          } else {
            console.warn(`[Processor] [${jobId}] No composite images found - skipping Shopify push`);
          }
        }
      }
    } catch (error) {
      console.error(`[Processor] [${jobId}] Shopify push error (non-fatal):`, error.message);
      // Don't fail the job if Shopify push fails - continue to DONE status
    }

    const step6Duration = Date.now() - step6Start;

    // Step 7: Mark as DONE
    console.log(`[Processor] [${jobId}] Step 7/7: Completing job`);

    db.prepare(`
      UPDATE jobs
      SET status = ?,
          completed_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(JobStatus.DONE, jobId);

    const totalDuration = Date.now() - step1Start;

    console.log(`[Processor] [${jobId}] ✅ Flow v2 pipeline complete (${totalDuration}ms)`);
    console.log(`[Processor] [${jobId}] Timing breakdown:`, {
      download_bg_removal: `${step1Duration}ms`,
      background_gen: `${step2Duration}ms`,
      compositing: `${step3Duration}ms`,
      derivatives: `${step4Duration}ms`,
      manifest: `${step5Duration}ms`,
      shopify_push: `${step6Duration}ms`,
      total: `${totalDuration}ms`
    });

  } catch (error) {
    console.error(`[Processor] [${jobId}] Cutout+Composite workflow error:`, error);
    failJob(jobId, ErrorCode.UNKNOWN, error.message, error.stack);
  }
}

/**
 * WORKFLOW B: Seedream 4 Edit (New - 5 steps)
 * Fast single-step AI background replacement
 */
async function processSeedreamWorkflow(jobId, job, db) {
  console.log(`[Processor] [${jobId}] ⚡ WORKFLOW B: Seedream 4 Edit (Single-Step)`);

  const startTime = Date.now();

  try {
    // Step 1: Download original + Background Removal (for cutout backup)
    const step1Start = Date.now();
    console.log(`[Processor] [${jobId}] Step 1/5: Download + Background Removal`);

    const segmentProvider = getSegmentProvider();
    const segmentResult = await segmentProvider.removeBackground({
      imageUrl: job.source_url,
      sku: job.sku,
      sha256: job.img_sha256
    });

    if (!segmentResult.success) {
      throw new Error(`Background removal failed: ${segmentResult.error}`);
    }

    const step1Duration = Date.now() - step1Start;

    console.log(`[Processor] [${jobId}] ✅ Step 1 complete (${step1Duration}ms)`);

    db.prepare(`
      UPDATE jobs
      SET s3_cutout_key = ?,
          s3_mask_key = ?,
          segmentation_ms = ?,
          cost_usd = cost_usd + ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      segmentResult.cutout.s3Key,
      segmentResult.mask.s3Key,
      step1Duration,
      segmentResult.cost,
      jobId
    );

    // Step 2: Seedream 4 Edit - Single-step background replacement
    const step2Start = Date.now();
    console.log(`[Processor] [${jobId}] Step 2/5: Seedream 4 Edit (AI Background Replacement)`);

    // Check for active background template
    const activeTemplate = getActiveBackgroundTemplate();
    let templateAssets = null;

    if (activeTemplate) {
      console.log(`[Processor] [${jobId}] Active template detected: "${activeTemplate.name}" (${activeTemplate.id})`);
      const template = getTemplateWithAssets(activeTemplate.id, db);

      if (template && template.assets && template.assets.length > 0) {
        templateAssets = template.assets;
        console.log(`[Processor] [${jobId}] Using template "${template.name}" with ${templateAssets.length} variants`);

        // Store template ID in job for tracking
        db.prepare('UPDATE jobs SET background_template_id = ? WHERE id = ?')
          .run(activeTemplate.id, jobId);
      } else {
        console.warn(`[Processor] [${jobId}] Template ${activeTemplate.id} has no assets, falling back to prompt`);
      }
    }

    const seedreamProvider = getSeedreamProvider();
    const composites = [];

    if (templateAssets && templateAssets.length > 0) {
      // TEMPLATE MODE: Use template backgrounds with Seedream Edit
      console.log(`[Processor] [${jobId}] Template Mode: Using ${Math.min(2, templateAssets.length)} template backgrounds`);

      const templatesToUse = templateAssets.slice(0, 2); // Use first 2 template variants

      for (let i = 0; i < templatesToUse.length; i++) {
        const templateAsset = templatesToUse[i];
        console.log(`[Processor] [${jobId}] Compositing cutout with template variant ${templateAsset.variant}...`);

        // Use Seedream to composite cutout with template background
        const editResult = await seedreamProvider.editBackground({
          imageUrl: segmentResult.cutout.s3Url, // Use cutout instead of original
          templateS3Key: templateAsset.s3_key,   // Pass template S3 key
          theme: job.theme,
          sku: job.sku,
          sha256: job.img_sha256,
          customPrompt: null, // Template provides the background
          variant: i + 1
        });

        if (!editResult.success) {
          throw new Error(`Seedream template edit ${i + 1} failed: ${editResult.error}`);
        }

        composites.push(editResult.s3Key);

        if (editResult.cost > 0) {
          db.prepare('UPDATE jobs SET cost_usd = cost_usd + ? WHERE id = ?')
            .run(editResult.cost, jobId);
          console.log(`[Processor] [${jobId}] Seedream template edit ${i + 1} cost: $${editResult.cost.toFixed(4)}`);
        }
      }

      // Update template usage count
      db.prepare('UPDATE background_templates SET used_count = used_count + 1 WHERE id = ?')
        .run(activeTemplate.id);

    } else {
      // PROMPT MODE: Generate themed backgrounds with Seedream Edit
      console.log(`[Processor] [${jobId}] Prompt Mode: Generating themed backgrounds`);

      const customPrompt = getBackgroundPrompt();

      if (customPrompt) {
        console.log(`[Processor] [${jobId}] Using custom prompt: "${customPrompt}"`);
      }

      // Generate 2 variants using Seedream
      for (let i = 1; i <= 2; i++) {
        console.log(`[Processor] [${jobId}] Generating Seedream edit ${i}/2...`);

        const editResult = await seedreamProvider.editBackground({
          imageUrl: job.source_url,
          theme: job.theme,
          sku: job.sku,
          sha256: job.img_sha256,
          customPrompt,
          variant: i
        });

        if (!editResult.success) {
          throw new Error(`Seedream edit ${i} failed: ${editResult.error}`);
        }

        composites.push(editResult.s3Key);

        if (editResult.cost > 0) {
          db.prepare('UPDATE jobs SET cost_usd = cost_usd + ? WHERE id = ?')
            .run(editResult.cost, jobId);
          console.log(`[Processor] [${jobId}] Seedream edit ${i} cost: $${editResult.cost.toFixed(4)}`);
        }
      }
    }

    const step2Duration = Date.now() - step2Start;

    console.log(`[Processor] [${jobId}] ✅ Step 2 complete (${step2Duration}ms):`, {
      composites: composites.length
    });

    // Update job: SKIP compositing step, go straight to COMPOSITED status
    db.prepare(`
      UPDATE jobs
      SET status = ?,
          s3_composite_keys = ?,
          compositing_ms = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      JobStatus.COMPOSITED,
      JSON.stringify(composites),
      step2Duration,
      jobId
    );

    // Step 3: Derivatives Generation
    const step3Start = Date.now();
    console.log(`[Processor] [${jobId}] Step 3/5: Generating derivatives`);

    job = getJob(jobId);
    const compositeS3Keys = JSON.parse(job.s3_composite_keys);

    const derivativesResult = await batchGenerateDerivatives({
      compositeS3Keys,
      sku: job.sku,
      sha256: job.img_sha256,
      theme: job.theme
    });

    if (!derivativesResult.success) {
      throw new Error('Derivatives generation failed');
    }

    const allDerivativeKeys = derivativesResult.results
      .flatMap(r => r.derivatives || [])
      .map(d => d.s3Key);

    const step3Duration = Date.now() - step3Start;

    console.log(`[Processor] [${jobId}] ✅ Step 3 complete (${step3Duration}ms):`, {
      totalDerivatives: allDerivativeKeys.length
    });

    db.prepare(`
      UPDATE jobs
      SET status = ?,
          s3_derivative_keys = ?,
          derivatives_ms = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      JobStatus.DERIVATIVES,
      JSON.stringify(allDerivativeKeys),
      step3Duration,
      jobId
    );

    // Step 4: Manifest Generation
    const step4Start = Date.now();
    console.log(`[Processor] [${jobId}] Step 4/5: Building manifest`);

    job = getJob(jobId);

    const manifestResult = await buildManifest(job, {
      derivatives: derivativesResult.results.flatMap(r => r.derivatives || [])
    });

    if (!manifestResult.success) {
      throw new Error(`Manifest generation failed: ${manifestResult.error}`);
    }

    const step4Duration = Date.now() - step4Start;

    console.log(`[Processor] [${jobId}] ✅ Step 4 complete (${step4Duration}ms):`, {
      manifest: manifestResult.s3Key
    });

    db.prepare(`
      UPDATE jobs
      SET manifest_s3_key = ?,
          manifest_ms = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      manifestResult.s3Key,
      step4Duration,
      jobId
    );

    // Step 5: Mark as DONE (skip Shopify for now)
    console.log(`[Processor] [${jobId}] Step 5/5: Completing job`);

    db.prepare(`
      UPDATE jobs
      SET status = ?,
          completed_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(JobStatus.DONE, jobId);

    const totalDuration = Date.now() - startTime;

    console.log(`[Processor] [${jobId}] ✅ Seedream workflow complete (${totalDuration}ms)`);
    console.log(`[Processor] [${jobId}] Timing breakdown:`, {
      segmentation: `${step1Duration}ms`,
      seedream_edit: `${step2Duration}ms`,
      derivatives: `${step3Duration}ms`,
      manifest: `${step4Duration}ms`,
      total: `${totalDuration}ms`
    });

  } catch (error) {
    console.error(`[Processor] [${jobId}] Seedream workflow error:`, error);
    failJob(jobId, ErrorCode.UNKNOWN, error.message, error.stack);
  }
}

/**
 * Get processor status
 */
export function getProcessorStatus() {
  return {
    isRunning,
    config: CONFIG,
    currentJobs: Array.from(currentJobs),
    version: '2.0'
  };
}

/**
 * Get processor configuration
 */
export function getProcessorConfig() {
  return {
    pollInterval: CONFIG.pollInterval,
    concurrency: CONFIG.concurrency,
    maxRetries: CONFIG.maxRetries,
    version: '2.0'
  };
}

export default {
  startProcessor,
  stopProcessor,
  getProcessorStatus,
  getProcessorConfig
};
