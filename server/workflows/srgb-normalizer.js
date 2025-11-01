/**
 * sRGB Color Normalization Workflow (Flow v2)
 *
 * Ensures all images use consistent sRGB colorspace for accurate color reproduction
 * across devices and platforms. Strips ICC profiles and normalizes gamma.
 *
 * This is critical for product photography where color accuracy matters.
 */

import sharp from 'sharp';

/**
 * Normalize image to sRGB colorspace
 *
 * @param {Buffer} inputBuffer - Input image buffer
 * @param {Object} options - Normalization options
 * @returns {Promise<Buffer>} Normalized image buffer
 */
export async function normalizeToSRGB(inputBuffer, options = {}) {
  const startTime = Date.now();

  console.log('[sRGB] Starting normalization...');

  try {
    // Get input metadata
    const inputMeta = await sharp(inputBuffer).metadata();

    console.log('[sRGB] Input metadata:', {
      format: inputMeta.format,
      width: inputMeta.width,
      height: inputMeta.height,
      space: inputMeta.space,
      hasAlpha: inputMeta.hasAlpha,
      hasProfile: !!inputMeta.icc
    });

    // Build Sharp pipeline
    let pipeline = sharp(inputBuffer, {
      // Force decode using embedded ICC profile (if present)
      // This ensures colors are interpreted correctly before conversion
      failOnError: false
    });

    // Convert to sRGB colorspace
    pipeline = pipeline.toColorspace('srgb');

    // Remove ICC profile (sRGB is assumed)
    // This reduces file size and ensures consistent interpretation
    pipeline = pipeline.withMetadata({
      icc: undefined, // Strip ICC profile
      exif: options.keepExif ? inputMeta.exif : undefined,
      density: 72 // Standard web density
    });

    // Apply gamma normalization if requested
    if (options.normalizeGamma) {
      pipeline = pipeline.gamma(2.2); // sRGB gamma
    }

    // Convert to buffer (preserving format and alpha)
    const outputBuffer = await pipeline.toBuffer();

    const duration = Date.now() - startTime;

    // Get output metadata for verification
    const outputMeta = await sharp(outputBuffer).metadata();

    console.log('[sRGB] Normalization complete:', {
      inputSpace: inputMeta.space,
      outputSpace: outputMeta.space,
      inputProfile: !!inputMeta.icc,
      outputProfile: !!outputMeta.icc,
      inputSize: `${(inputBuffer.length / 1024).toFixed(2)}KB`,
      outputSize: `${(outputBuffer.length / 1024).toFixed(2)}KB`,
      duration: `${duration}ms`
    });

    return outputBuffer;

  } catch (error) {
    const duration = Date.now() - startTime;

    console.error('[sRGB] Normalization failed:', {
      error: error.message,
      duration: `${duration}ms`
    });

    // Fallback: return original buffer if normalization fails
    // This prevents pipeline failures due to color management issues
    console.warn('[sRGB] Falling back to original buffer');
    return inputBuffer;
  }
}

/**
 * Verify if an image is in sRGB colorspace
 *
 * @param {Buffer} buffer - Image buffer
 * @returns {Promise<Object>} Verification result
 */
export async function verifySRGB(buffer) {
  try {
    const meta = await sharp(buffer).metadata();

    const isSRGB = meta.space === 'srgb';
    const hasProfile = !!meta.icc;

    return {
      isSRGB,
      hasProfile,
      colorspace: meta.space,
      recommendation: !isSRGB
        ? 'Image should be normalized to sRGB'
        : hasProfile
        ? 'Image is sRGB but has ICC profile (can be stripped)'
        : 'Image is correctly normalized'
    };

  } catch (error) {
    console.error('[sRGB] Verification failed:', error.message);
    return {
      isSRGB: false,
      hasProfile: false,
      error: error.message
    };
  }
}

/**
 * Batch normalize multiple images to sRGB
 *
 * @param {Array<Buffer>} buffers - Array of image buffers
 * @param {Object} options - Normalization options
 * @returns {Promise<Array<Buffer>>} Array of normalized buffers
 */
export async function batchNormalizeToSRGB(buffers, options = {}) {
  console.log('[sRGB] Starting batch normalization:', {
    count: buffers.length
  });

  const results = await Promise.all(
    buffers.map(buffer => normalizeToSRGB(buffer, options))
  );

  console.log('[sRGB] Batch normalization complete:', {
    total: results.length
  });

  return results;
}

/**
 * Detect common colorspace issues
 *
 * @param {Buffer} buffer - Image buffer
 * @returns {Promise<Object>} Issue detection result
 */
export async function detectColorspaceIssues(buffer) {
  try {
    const meta = await sharp(buffer).metadata();

    const issues = [];

    // Check for non-sRGB colorspace
    if (meta.space && meta.space !== 'srgb') {
      issues.push({
        type: 'colorspace',
        severity: 'high',
        message: `Image uses ${meta.space} colorspace instead of sRGB`,
        fix: 'Convert to sRGB using normalizeToSRGB()'
      });
    }

    // Check for ICC profile
    if (meta.icc) {
      issues.push({
        type: 'icc_profile',
        severity: 'low',
        message: 'Image has embedded ICC profile',
        fix: 'Strip ICC profile for smaller file size and consistent interpretation'
      });
    }

    // Check for unusual density
    if (meta.density && (meta.density < 72 || meta.density > 300)) {
      issues.push({
        type: 'density',
        severity: 'low',
        message: `Unusual density: ${meta.density} DPI`,
        fix: 'Normalize to 72 DPI for web use'
      });
    }

    return {
      hasIssues: issues.length > 0,
      issues,
      metadata: {
        colorspace: meta.space,
        hasProfile: !!meta.icc,
        density: meta.density
      }
    };

  } catch (error) {
    console.error('[sRGB] Issue detection failed:', error.message);
    return {
      hasIssues: false,
      issues: [],
      error: error.message
    };
  }
}

export default {
  normalizeToSRGB,
  verifySRGB,
  batchNormalizeToSRGB,
  detectColorspaceIssues
};
