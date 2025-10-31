/**
 * Job State Machine
 *
 * Defines valid state transitions and guards for the job processing pipeline.
 * Ensures jobs move through states correctly and prevents invalid transitions.
 */

// Valid job statuses
export const JobStatus = {
  NEW: 'NEW',                           // Job created, not yet started
  QUEUED: 'QUEUED',                     // Job queued for processing
  SEGMENTING: 'SEGMENTING',             // AI segmentation in progress
  BG_GENERATING: 'BG_GENERATING',       // Background generation in progress
  COMPOSITING: 'COMPOSITING',           // Server-side compositing in progress
  SHOPIFY_PUSH: 'SHOPIFY_PUSH',         // Uploading to Shopify
  DONE: 'DONE',                         // Successfully completed
  FAILED: 'FAILED'                      // Permanent failure
};

// Valid error codes
export const ErrorCode = {
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',           // SKU not found in Shopify
  SEGMENT_FAILED: 'SEGMENT_FAILED',                 // AI segmentation provider error
  BG_FAILED: 'BG_FAILED',                           // Background generation provider error
  COMPOSITE_FAILED: 'COMPOSITE_FAILED',             // Server-side compositing error
  SHOPIFY_UPLOAD_FAILED: 'SHOPIFY_UPLOAD_FAILED',   // Shopify API error
  S3_UPLOAD_FAILED: 'S3_UPLOAD_FAILED',             // S3 storage error
  TIMEOUT: 'TIMEOUT',                               // Job exceeded max processing time
  INVALID_IMAGE: 'INVALID_IMAGE',                   // Image quality/size validation failed
  QUALITY_CHECK_FAILED: 'QUALITY_CHECK_FAILED',     // Output quality below threshold
  MAX_RETRIES_EXCEEDED: 'MAX_RETRIES_EXCEEDED',     // Retry limit reached
  UNKNOWN: 'UNKNOWN'                                // Unclassified error
};

// Valid state transitions (from -> to[])
const VALID_TRANSITIONS = {
  [JobStatus.NEW]: [JobStatus.QUEUED, JobStatus.FAILED],
  [JobStatus.QUEUED]: [JobStatus.SEGMENTING, JobStatus.FAILED],
  [JobStatus.SEGMENTING]: [JobStatus.BG_GENERATING, JobStatus.FAILED],
  [JobStatus.BG_GENERATING]: [JobStatus.COMPOSITING, JobStatus.FAILED],
  [JobStatus.COMPOSITING]: [JobStatus.SHOPIFY_PUSH, JobStatus.FAILED],
  [JobStatus.SHOPIFY_PUSH]: [JobStatus.DONE, JobStatus.FAILED],
  [JobStatus.DONE]: [], // Terminal state
  [JobStatus.FAILED]: [] // Terminal state
};

/**
 * Check if a state transition is valid
 * @param {string} fromStatus - Current status
 * @param {string} toStatus - Desired status
 * @returns {boolean} True if transition is valid
 */
export function isValidTransition(fromStatus, toStatus) {
  const allowedTransitions = VALID_TRANSITIONS[fromStatus];
  if (!allowedTransitions) {
    return false;
  }
  return allowedTransitions.includes(toStatus);
}

/**
 * Get next valid statuses from current status
 * @param {string} status - Current status
 * @returns {string[]} Array of valid next statuses
 */
export function getNextStatuses(status) {
  return VALID_TRANSITIONS[status] || [];
}

/**
 * Check if a status is terminal (no further transitions)
 * @param {string} status - Status to check
 * @returns {boolean} True if terminal
 */
export function isTerminalStatus(status) {
  return status === JobStatus.DONE || status === JobStatus.FAILED;
}

/**
 * Validate job data before state transition
 * Each state has required fields that must be present
 */
const REQUIRED_FIELDS = {
  [JobStatus.NEW]: ['sku', 'img_sha256', 'theme'],
  [JobStatus.QUEUED]: ['source_url'],
  [JobStatus.SEGMENTING]: ['s3_original_key'],
  [JobStatus.BG_GENERATING]: ['s3_mask_key'],
  [JobStatus.COMPOSITING]: ['s3_bg_keys'], // JSON array
  [JobStatus.SHOPIFY_PUSH]: ['s3_composite_keys'], // JSON array
  [JobStatus.DONE]: ['shopify_media_ids'], // JSON array
  [JobStatus.FAILED]: ['error_code', 'error_message']
};

/**
 * Validate job has required fields for a given status
 * @param {object} job - Job object
 * @param {string} status - Status to validate for
 * @returns {{valid: boolean, missing?: string[]}} Validation result
 */
export function validateJobForStatus(job, status) {
  const required = REQUIRED_FIELDS[status];
  if (!required) {
    return { valid: true };
  }

  const missing = required.filter(field => {
    const value = job[field];
    if (value === null || value === undefined || value === '') {
      return true;
    }
    // For JSON fields, check they parse to non-empty arrays
    if (field.endsWith('_keys') || field.endsWith('_ids')) {
      try {
        const parsed = JSON.parse(value);
        return !Array.isArray(parsed) || parsed.length === 0;
      } catch {
        return true;
      }
    }
    return false;
  });

  if (missing.length > 0) {
    return { valid: false, missing };
  }

  return { valid: true };
}

/**
 * Attempt to transition a job to a new status
 * @param {object} job - Current job object
 * @param {string} newStatus - Desired status
 * @param {object} updates - Additional fields to update
 * @returns {{success: boolean, error?: string, updates?: object}} Transition result
 */
export function transitionJob(job, newStatus, updates = {}) {
  const currentStatus = job.status;

  // Check if already in terminal state
  if (isTerminalStatus(currentStatus) && currentStatus !== newStatus) {
    return {
      success: false,
      error: `Cannot transition from terminal state ${currentStatus} to ${newStatus}`
    };
  }

  // Check if transition is valid
  if (!isValidTransition(currentStatus, newStatus)) {
    return {
      success: false,
      error: `Invalid transition: ${currentStatus} -> ${newStatus}. Valid transitions: ${getNextStatuses(currentStatus).join(', ')}`
    };
  }

  // Merge updates with new status
  const mergedJob = { ...job, ...updates, status: newStatus };

  // Validate job has required fields for new status
  const validation = validateJobForStatus(mergedJob, newStatus);
  if (!validation.valid) {
    return {
      success: false,
      error: `Missing required fields for ${newStatus}: ${validation.missing.join(', ')}`
    };
  }

  // Prepare final updates
  const finalUpdates = {
    ...updates,
    status: newStatus,
    updated_at: new Date().toISOString()
  };

  // Set completed_at for terminal states
  if (isTerminalStatus(newStatus)) {
    finalUpdates.completed_at = new Date().toISOString();
  }

  return {
    success: true,
    updates: finalUpdates
  };
}

/**
 * Check if a job can be retried
 * @param {object} job - Job object
 * @param {number} maxRetries - Maximum retry attempts (default: 3)
 * @returns {boolean} True if can retry
 */
export function canRetry(job, maxRetries = 3) {
  return job.status === JobStatus.FAILED &&
         (job.attempt || 0) < maxRetries &&
         job.error_code !== ErrorCode.INVALID_IMAGE && // Don't retry invalid images
         job.error_code !== ErrorCode.PRODUCT_NOT_FOUND; // Don't retry missing products
}

/**
 * Calculate exponential backoff delay for retries
 * @param {number} attempt - Current attempt number (0-indexed)
 * @returns {number} Delay in milliseconds
 */
export function getRetryDelay(attempt) {
  const baseDelay = 2000; // 2 seconds
  return baseDelay * Math.pow(2, attempt); // 2s, 4s, 8s, 16s...
}

/**
 * Get human-readable status description
 * @param {string} status - Job status
 * @returns {string} Description
 */
export function getStatusDescription(status) {
  const descriptions = {
    [JobStatus.NEW]: 'Job created, awaiting processing',
    [JobStatus.QUEUED]: 'Job queued for processing',
    [JobStatus.SEGMENTING]: 'AI removing background from image',
    [JobStatus.BG_GENERATING]: 'AI generating themed background',
    [JobStatus.COMPOSITING]: 'Compositing bottle with new background',
    [JobStatus.SHOPIFY_PUSH]: 'Uploading to Shopify',
    [JobStatus.DONE]: 'Successfully completed',
    [JobStatus.FAILED]: 'Failed - see error details'
  };
  return descriptions[status] || 'Unknown status';
}

/**
 * Estimate job duration based on current status
 * @param {string} status - Current status
 * @returns {number} Estimated remaining time in seconds
 */
export function estimateRemainingTime(status) {
  const estimates = {
    [JobStatus.NEW]: 300, // 5 minutes
    [JobStatus.QUEUED]: 280,
    [JobStatus.SEGMENTING]: 240, // 4 minutes (AI processing)
    [JobStatus.BG_GENERATING]: 180, // 3 minutes (AI processing)
    [JobStatus.COMPOSITING]: 60, // 1 minute (server-side)
    [JobStatus.SHOPIFY_PUSH]: 30, // 30 seconds
    [JobStatus.DONE]: 0,
    [JobStatus.FAILED]: 0
  };
  return estimates[status] || 0;
}

export default {
  JobStatus,
  ErrorCode,
  isValidTransition,
  getNextStatuses,
  isTerminalStatus,
  validateJobForStatus,
  transitionJob,
  canRetry,
  getRetryDelay,
  getStatusDescription,
  estimateRemainingTime
};
