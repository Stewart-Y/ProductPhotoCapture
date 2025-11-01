/**
 * Job Manager
 *
 * Handles job CRUD operations and business logic.
 * All database interactions for jobs go through this module.
 */

import { nanoid } from 'nanoid';
import db from '../db.js';
import { JobStatus, ErrorCode, transitionJob, isTerminalStatus } from './state-machine.js';

/**
 * Create a new job
 * Implements idempotency: same sku+img_sha256+theme returns existing job
 *
 * @param {object} params - Job creation parameters
 * @param {string} params.sku - Product SKU
 * @param {string} params.imageUrl - Source image URL from 3JMS
 * @param {string} params.sha256 - SHA256 hash of image (idempotency key)
 * @param {string} params.theme - Background theme (default: 'default')
 * @returns {object} Job object
 */
export function createJob({ sku, imageUrl, sha256, theme = 'default' }) {
  // Check for existing job (idempotency)
  const existing = db.prepare(`
    SELECT * FROM jobs
    WHERE sku = ? AND img_sha256 = ? AND theme = ?
  `).get(sku, sha256, theme);

  if (existing) {
    console.log(`[JobManager] Job already exists: ${existing.id} (${existing.status})`);
    return existing;
  }

  // Create new job
  const jobId = nanoid();
  const now = new Date().toISOString();

  const job = {
    id: jobId,
    sku,
    img_sha256: sha256,
    theme,
    status: JobStatus.NEW,
    attempt: 0,
    source_url: imageUrl,
    created_at: now,
    updated_at: now
  };

  db.prepare(`
    INSERT INTO jobs (
      id, sku, img_sha256, theme, status, attempt,
      source_url, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    job.id, job.sku, job.img_sha256, job.theme, job.status, job.attempt,
    job.source_url, job.created_at, job.updated_at
  );

  console.log(`[JobManager] ✅ Created job: ${jobId} (SKU: ${sku}, theme: ${theme})`);
  return job;
}

/**
 * Get a job by ID
 * @param {string} jobId - Job ID
 * @returns {object|null} Job object or null if not found
 */
export function getJob(jobId) {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  return job || null;
}

/**
 * List jobs with optional filters
 * @param {object} filters - Query filters
 * @param {string} filters.status - Filter by status
 * @param {string} filters.sku - Filter by SKU
 * @param {string} filters.theme - Filter by theme
 * @param {number} filters.limit - Max results (default: 100)
 * @param {number} filters.offset - Pagination offset (default: 0)
 * @returns {object[]} Array of job objects
 */
export function listJobs(filters = {}) {
  const {
    status,
    sku,
    theme,
    limit = 100,
    offset = 0
  } = filters;

  let query = 'SELECT * FROM jobs WHERE 1=1';
  const params = [];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  if (sku) {
    query += ' AND sku = ?';
    params.push(sku);
  }

  if (theme) {
    query += ' AND theme = ?';
    params.push(theme);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  try {
    return db.prepare(query).all(...params);
  } catch (err) {
    console.error(`[JobManager] listJobs error - Query: ${query}, Params: ${params.length} items (${params.join(', ')})`, err.message);
    throw err;
  }
}

/**
 * Update job status with state machine validation
 * @param {string} jobId - Job ID
 * @param {string} newStatus - New status
 * @param {object} updates - Additional fields to update
 * @returns {{success: boolean, job?: object, error?: string}} Update result
 */
export function updateJobStatus(jobId, newStatus, updates = {}) {
  const job = getJob(jobId);
  if (!job) {
    return { success: false, error: 'Job not found' };
  }

  // Use state machine to validate transition
  const transition = transitionJob(job, newStatus, updates);
  if (!transition.success) {
    console.error(`[JobManager] ❌ Invalid transition for job ${jobId}: ${transition.error}`);
    return { success: false, error: transition.error };
  }

  // Build UPDATE query dynamically based on provided updates
  const finalUpdates = transition.updates;
  const fields = Object.keys(finalUpdates);

  if (fields.length === 0) {
    console.error(`[JobManager] ❌ No fields to update for job ${jobId}`);
    return { success: false, error: 'No fields to update' };
  }

  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => finalUpdates[f]);

  try {
    const query = `UPDATE jobs SET ${setClause} WHERE id = ?`;
    db.prepare(query).run(...values, jobId);
  } catch (err) {
    console.error(`[JobManager] ❌ Database update error for job ${jobId}:`, err.message);
    console.error(`[JobManager] Fields: ${fields.join(', ')}, Values: ${values.length} items`);
    throw err;
  }

  const updatedJob = getJob(jobId);
  console.log(`[JobManager] ✅ Updated job ${jobId}: ${job.status} -> ${newStatus}`);

  return { success: true, job: updatedJob };
}

/**
 * Mark job as failed with error details
 * @param {string} jobId - Job ID
 * @param {string} errorCode - Error code from ErrorCode enum
 * @param {string} errorMessage - Human-readable error message
 * @param {string} errorStack - Optional stack trace
 * @returns {{success: boolean, job?: object, error?: string}} Update result
 */
export function failJob(jobId, errorCode, errorMessage, errorStack = null) {
  return updateJobStatus(jobId, JobStatus.FAILED, {
    error_code: errorCode,
    error_message: errorMessage,
    error_stack: errorStack
  });
}

/**
 * Update job with S3 keys (after upload)
 * @param {string} jobId - Job ID
 * @param {object} keys - S3 keys to update
 * @param {string} keys.original - Original image S3 key
 * @param {string} keys.mask - Mask S3 key
 * @param {string[]} keys.backgrounds - Background S3 keys
 * @param {string[]} keys.composites - Composite S3 keys
 * @param {string[]} keys.thumbnails - Thumbnail S3 keys
 * @returns {{success: boolean, job?: object, error?: string}} Update result
 */
export function updateJobS3Keys(jobId, keys) {
  const updates = {};

  if (keys.original) {
    updates.s3_original_key = keys.original;
  }

  if (keys.mask) {
    updates.s3_mask_key = keys.mask;
  }

  if (keys.backgrounds) {
    updates.s3_bg_keys = JSON.stringify(keys.backgrounds);
  }

  if (keys.composites) {
    updates.s3_composite_keys = JSON.stringify(keys.composites);
  }

  if (keys.thumbnails) {
    updates.s3_thumb_keys = JSON.stringify(keys.thumbnails);
  }

  const job = getJob(jobId);
  if (!job) {
    return { success: false, error: 'Job not found' };
  }

  // Don't change status, just update keys
  const fields = Object.keys(updates);
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => updates[f]);

  db.prepare(`
    UPDATE jobs SET ${setClause}, updated_at = ? WHERE id = ?
  `).run(...values, new Date().toISOString(), jobId);

  const updatedJob = getJob(jobId);
  console.log(`[JobManager] ✅ Updated S3 keys for job ${jobId}`);

  return { success: true, job: updatedJob };
}

/**
 * Update job with Shopify media IDs (after successful upload)
 * @param {string} jobId - Job ID
 * @param {string[]} mediaIds - Shopify media GIDs
 * @returns {{success: boolean, job?: object, error?: string}} Update result
 */
export function updateJobShopifyMediaIds(jobId, mediaIds) {
  return updateJobStatus(jobId, JobStatus.DONE, {
    shopify_media_ids: JSON.stringify(mediaIds)
  });
}

/**
 * Increment job attempt counter (for retries)
 * @param {string} jobId - Job ID
 * @returns {{success: boolean, job?: object, error?: string}} Update result
 */
export function incrementJobAttempt(jobId) {
  const job = getJob(jobId);
  if (!job) {
    return { success: false, error: 'Job not found' };
  }

  const newAttempt = (job.attempt || 0) + 1;

  db.prepare(`
    UPDATE jobs SET attempt = ?, updated_at = ? WHERE id = ?
  `).run(newAttempt, new Date().toISOString(), jobId);

  console.log(`[JobManager] Job ${jobId} attempt incremented to ${newAttempt}`);

  return { success: true, job: getJob(jobId) };
}

/**
 * Update job cost tracking
 * @param {string} jobId - Job ID
 * @param {number} additionalCost - Cost to add in USD
 * @returns {{success: boolean, job?: object, error?: string}} Update result
 */
export function addJobCost(jobId, additionalCost) {
  const job = getJob(jobId);
  if (!job) {
    return { success: false, error: 'Job not found' };
  }

  const currentCost = job.cost_usd || 0.0;
  const newCost = currentCost + additionalCost;

  db.prepare(`
    UPDATE jobs SET cost_usd = ?, updated_at = ? WHERE id = ?
  `).run(newCost, new Date().toISOString(), jobId);

  console.log(`[JobManager] Job ${jobId} cost updated: $${currentCost.toFixed(4)} -> $${newCost.toFixed(4)}`);

  return { success: true, job: getJob(jobId) };
}

/**
 * Get job statistics
 * @returns {object} Statistics object
 */
export function getJobStats() {
  const stats = {
    total: 0,
    byStatus: {},
    totalCost: 0.0,
    avgDuration: 0,
    failureRate: 0
  };

  // Total jobs
  const totalRow = db.prepare('SELECT COUNT(*) as count FROM jobs').get();
  stats.total = totalRow.count;

  // By status
  const byStatus = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM jobs
    GROUP BY status
  `).all();

  byStatus.forEach(row => {
    stats.byStatus[row.status] = row.count;
  });

  // Total cost
  const costRow = db.prepare('SELECT SUM(cost_usd) as total FROM jobs').get();
  stats.totalCost = costRow.total || 0.0;

  // Average duration (for completed jobs)
  const durationRow = db.prepare(`
    SELECT AVG(
      (julianday(completed_at) - julianday(created_at)) * 86400
    ) as avg_seconds
    FROM jobs
    WHERE completed_at IS NOT NULL
  `).get();
  stats.avgDuration = durationRow.avg_seconds || 0;

  // Failure rate
  const failedCount = stats.byStatus[JobStatus.FAILED] || 0;
  stats.failureRate = stats.total > 0 ? (failedCount / stats.total) * 100 : 0;

  return stats;
}

/**
 * Delete old jobs (cleanup)
 * @param {number} daysOld - Delete jobs older than this many days
 * @returns {number} Number of jobs deleted
 */
export function deleteOldJobs(daysOld = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  const cutoffISO = cutoffDate.toISOString();

  const result = db.prepare(`
    DELETE FROM jobs
    WHERE created_at < ? AND status IN (?, ?)
  `).run(cutoffISO, JobStatus.DONE, JobStatus.FAILED);

  console.log(`[JobManager] Deleted ${result.changes} jobs older than ${daysOld} days`);
  return result.changes;
}

/**
 * Check if SKU has reached max images limit
 * @param {string} sku - Product SKU
 * @param {number} maxImages - Max images per SKU (default: 4)
 * @returns {boolean} True if limit reached
 */
export function hasReachedImageLimit(sku, maxImages = 4) {
  const count = db.prepare(`
    SELECT COUNT(*) as count
    FROM jobs
    WHERE sku = ? AND status = ?
  `).get(sku, JobStatus.DONE);

  return count.count >= maxImages;
}

export default {
  createJob,
  getJob,
  listJobs,
  updateJobStatus,
  failJob,
  updateJobS3Keys,
  updateJobShopifyMediaIds,
  incrementJobAttempt,
  addJobCost,
  getJobStats,
  deleteOldJobs,
  hasReachedImageLimit
};
