/**
 * Freepik AI Composite Provider
 *
 * Uses Freepik Seedream 4 Edit API to intelligently composite
 * product cutouts onto background scenes with AI-powered:
 * - Natural lighting and shadow integration
 * - Realistic perspective and scale
 * - Professional product placement
 */

import fetch from 'node-fetch';
import sharp from 'sharp';
import { getStorage } from '../../storage/index.js';

export class FreepikCompositeProvider {
  constructor({ apiKey }) {
    if (!apiKey) {
      throw new Error('Freepik API key is required');
    }

    this.apiKey = apiKey;
    this.apiUrl = 'https://api.freepik.com/v1/ai/text-to-image/seedream-v4-edit';
  }

  /**
   * AI-powered composite using Seedream 4 Edit
   *
   * @param {Object} params
   * @param {string} params.cutoutS3Key - S3 key for product cutout (transparent PNG)
   * @param {string} params.backgroundS3Key - S3 key for background image
   * @param {string} params.sku - Product SKU
   * @param {string} params.sha256 - Image hash
   * @param {string} params.theme - Theme name
   * @param {number} params.variant - Variant number
   * @param {Object} params.options - Additional options
   * @returns {Promise<Object>} Composite result with S3 key and metadata
   */
  async compositeImage({
    cutoutS3Key,
    backgroundS3Key,
    sku,
    sha256,
    theme = 'default',
    variant = 1,
    options = {}
  }) {
    const startTime = Date.now();

    console.log('[FreepikComposite] Starting AI-powered composite', {
      sku,
      theme,
      cutoutS3Key,
      backgroundS3Key
    });

    try {
      const storage = getStorage();

      // Step 1: Download cutout and background from S3
      console.log('[FreepikComposite] Downloading images from S3...');
      const [cutoutBuffer, backgroundBuffer] = await Promise.all([
        this.downloadFromS3(storage, cutoutS3Key),
        this.downloadFromS3(storage, backgroundS3Key)
      ]);

      console.log('[FreepikComposite] Downloaded:', {
        cutoutSize: `${(cutoutBuffer.length / 1024).toFixed(2)}KB`,
        backgroundSize: `${(backgroundBuffer.length / 1024).toFixed(2)}KB`
      });

      // Step 2: Resize images to max 1024px (Seedream limit)
      console.log('[FreepikComposite] Resizing images to 1024px max...');
      const [resizedCutout, resizedBackground] = await Promise.all([
        sharp(cutoutBuffer)
          .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
          .png()
          .toBuffer(),
        sharp(backgroundBuffer)
          .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 90 })
          .toBuffer()
      ]);

      console.log('[FreepikComposite] Resized:', {
        cutoutSize: `${(resizedCutout.length / 1024).toFixed(2)}KB`,
        backgroundSize: `${(resizedBackground.length / 1024).toFixed(2)}KB`
      });

      // Step 3: Convert images to base64
      const cutoutBase64 = resizedCutout.toString('base64');
      const backgroundBase64 = resizedBackground.toString('base64');

      // Step 4: Detect if background is simple/solid color (Flow v2)
      const isSimpleBackground = await this.isSimpleBackground(resizedBackground);

      // Step 5: Build AI composite prompt (different for simple vs complex backgrounds)
      let prompt;
      if (options.customPrompt) {
        prompt = options.customPrompt;
      } else if (isSimpleBackground) {
        prompt = this.buildSimpleCompositePrompt(theme);
      } else {
        prompt = this.buildCompositePrompt(theme);
      }

      console.log('[FreepikComposite] Submitting to Seedream AI...', {
        prompt: prompt.substring(0, 100) + '...',
        isSimpleBackground
      });

      // Step 4: Submit to Seedream 4 Edit API
      const taskId = await this.submitCompositeRequest({
        cutoutBase64,
        backgroundBase64,
        prompt
      });

      console.log('[FreepikComposite] Task submitted:', taskId);

      // Step 5: Poll for completion
      const result = await this.pollForCompletion(taskId);

      if (!result.success) {
        throw new Error(result.error || 'AI composite failed');
      }

      console.log('[FreepikComposite] AI generation complete, downloading result...');

      // Step 6: Download generated composite
      const compositeBuffer = await this.downloadGeneratedImage(result.imageUrl);

      // Step 7: Upload to S3
      const aspect = options.aspect || '1x1';
      const type = options.type || 'master';
      const compositeS3Key = storage.getCompositeKey(sku, sha256, theme, aspect, variant, type);

      console.log('[FreepikComposite] Uploading to S3:', compositeS3Key);
      await storage.uploadBuffer(compositeS3Key, compositeBuffer, 'image/jpeg');

      // Step 8: Generate presigned URL
      const compositeS3Url = await storage.getPresignedGetUrl(compositeS3Key, 3600);

      const duration = Date.now() - startTime;

      console.log('[FreepikComposite] Composite complete:', {
        sku,
        theme,
        s3Key: compositeS3Key,
        duration: `${duration}ms`,
        cost: '$0.0200' // Seedream cost per generation
      });

      return {
        success: true,
        s3Key: compositeS3Key,
        s3Url: compositeS3Url,
        metadata: {
          duration,
          size: compositeBuffer.length,
          provider: 'freepik-seedream',
          taskId: result.taskId
        },
        cost: 0.02 // $0.02 per Seedream generation
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      console.error('[FreepikComposite] Composite failed:', {
        sku,
        theme,
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
   * Submit composite request to Seedream API
   */
  async submitCompositeRequest({ cutoutBase64, backgroundBase64, prompt }) {
    try {
      const payload = {
        prompt,
        reference_images: [cutoutBase64, backgroundBase64], // CUTOUT FIRST (primary reference to preserve)
        guidance_scale: 7.5, // How closely to follow prompt (0-20)
        preserve_details: true // Request maximum detail preservation
      };

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-freepik-api-key': this.apiKey
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Seedream API error (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      const data = result.data || result;
      const taskId = data.task_id || data.id;

      if (!taskId) {
        throw new Error(`No task ID returned: ${JSON.stringify(result)}`);
      }

      return taskId;

    } catch (error) {
      console.error('[FreepikComposite] Submit request failed:', error.message);
      throw error;
    }
  }

  /**
   * Poll for completion
   */
  async pollForCompletion(taskId) {
    const maxAttempts = 60; // ~5 minutes max
    const initialInterval = 3000; // Start with 3 seconds
    const maxInterval = 10000; // Cap at 10 seconds
    const backoffMultiplier = 1.5;

    let attempts = 0;
    let pollInterval = initialInterval;

    console.log('[FreepikComposite] Polling for task completion...', { taskId, maxAttempts });

    while (attempts < maxAttempts) {
      attempts++;

      try {
        const pollUrl = `${this.apiUrl}/${taskId}`;
        const response = await fetch(pollUrl, {
          method: 'GET',
          headers: {
            'x-freepik-api-key': this.apiKey
          }
        });

        if (!response.ok) {
          throw new Error(`Poll failed (${response.status}): ${await response.text()}`);
        }

        const result = await response.json();
        const data = result.data || result;
        const status = (data.status || '').toUpperCase();

        console.log(`[FreepikComposite] Poll attempt ${attempts}/${maxAttempts}:`, status);

        // Check for completion
        if (status === 'COMPLETED' || status === 'DONE' || status === 'SUCCESS' || status === 'FINISHED') {
          // Extract URL from generated array
          let imageUrl = null;
          if (data.generated && Array.isArray(data.generated) && data.generated.length > 0) {
            imageUrl = data.generated[0].url || data.generated[0];
          } else if (data.url) {
            imageUrl = data.url;
          }

          if (!imageUrl) {
            throw new Error(`Composite completed but no URL found: ${JSON.stringify(result)}`);
          }

          console.log('[FreepikComposite] Composite completed successfully', {
            attempts,
            imageUrl: imageUrl.substring(0, 100) + '...'
          });

          return {
            success: true,
            imageUrl,
            taskId
          };
        }

        // Check for failure
        if (status === 'FAILED' || status === 'ERROR') {
          const errorMsg = data.error || data.message || 'Unknown error';
          throw new Error(`Composite failed: ${errorMsg}`);
        }

        // Still processing, wait before next poll
        await this.sleep(pollInterval);

        // Increase poll interval with exponential backoff
        pollInterval = Math.min(pollInterval * backoffMultiplier, maxInterval);

      } catch (error) {
        if (attempts >= maxAttempts) {
          throw new Error(`Polling timeout after ${attempts} attempts: ${error.message}`);
        }
        // Continue polling on transient errors
        console.warn(`[FreepikComposite] Poll attempt ${attempts} failed, retrying...`, error.message);
        await this.sleep(pollInterval);
      }
    }

    throw new Error(`Composite timeout after ${maxAttempts} polling attempts`);
  }

  /**
   * Download generated image from Freepik URL
   */
  async downloadGeneratedImage(url) {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to download composite: ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);

    } catch (error) {
      console.error('[FreepikComposite] Download failed:', error.message);
      throw error;
    }
  }

  /**
   * Download file from S3 to buffer
   */
  async downloadFromS3(storage, s3Key) {
    try {
      const url = await storage.getPresignedGetUrl(s3Key, 300); // 5 minutes
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to download ${s3Key}: ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);

    } catch (error) {
      console.error('[FreepikComposite] S3 download failed:', { s3Key, error: error.message });
      throw error;
    }
  }

  /**
   * Detect if background is simple/solid color (low complexity)
   * Simple backgrounds need literal placement, not creative generation
   */
  async isSimpleBackground(imageBuffer) {
    try {
      const metadata = await sharp(imageBuffer).stats();

      // Calculate color variance across channels
      const channels = metadata.channels;
      let totalVariance = 0;

      for (const channel of channels) {
        // Variance = standard deviation squared
        const variance = Math.pow(channel.stdev, 2);
        totalVariance += variance;
      }

      const avgVariance = totalVariance / channels.length;

      // If average variance is very low, it's likely a simple/solid background
      // Threshold: < 100 is very simple (solid colors, gradients)
      const isSimple = avgVariance < 100;

      console.log('[FreepikComposite] Background complexity analysis:', {
        avgVariance: avgVariance.toFixed(2),
        isSimple,
        threshold: 100
      });

      return isSimple;

    } catch (error) {
      console.error('[FreepikComposite] Background analysis failed:', error.message);
      return false; // Default to complex if analysis fails
    }
  }

  /**
   * Build AI composite prompt for SIMPLE backgrounds (literal placement)
   * Universal prompt that works for all background types without shadows
   */
  buildSimpleCompositePrompt(theme) {
    return this.buildUniversalCompositePrompt(theme);
  }

  /**
   * Build AI composite prompt for COMPLEX backgrounds (creative integration)
   * Universal prompt that works for all background types without shadows
   */
  buildCompositePrompt(theme) {
    return this.buildUniversalCompositePrompt(theme);
  }

  /**
   * Universal composite prompt (no shadows, background-only lighting adjustments)
   * Optimized for Freepik Seedream 4 Edit API with mask support
   */
  buildUniversalCompositePrompt(theme) {
    const basePrompt =
      "TASK: Composite two images into one.\n" +
      "- Image A = product bottle (subject). Use it exactly as provided (no regeneration).\n" +
      "- Image B = background scene. Keep full canvas size/aspect.\n\n" +

      "GOAL:\n" +
      "- Center the bottle perfectly in the final frame.\n" +
      "- Match lighting between subject and background by adjusting the BACKGROUND ONLY.\n" +
      "- Absolutely NO SHADOWS (no cast shadow, drop shadow, reflection, glow, or halo).\n" +
      "- Preserve label text/logos on the bottle pixel-for-pixel (no re-drawing or resynthesis).\n\n" +

      "MASK (optional but recommended):\n" +
      "- Treat the bottle region as PROTECTED/immutable. Apply edits only to non-masked pixels.\n\n" +

      "INSTRUCTIONS:\n" +
      "1) Place the bottle centered on the canvas (do not crop the background).\n" +
      "2) Do NOT modify bottle pixels: keep edges, glass texture, foil/cap, label typography, barcodes, and micro-text unchanged.\n" +
      "3) Harmonize by adjusting ONLY the background's exposure, contrast, white balance, and color temperature to match the bottle's lighting.\n" +
      "4) Ensure clean, anti-aliased compositing at the bottle contour—no halos or fringing.\n" +
      "5) Do not add or simulate any shadows, reflections, glow, bloom, or gradients near the subject.\n" +
      "6) No generative fill over the bottle area. No text additions/removals anywhere.\n" +
      "7) Output a single composite at the background's native resolution; bottle centered; no borders/watermarks.\n\n" +

      "NEGATIVE CONSTRAINTS:\n" +
      "- Do NOT re-render, repaint, stylize, enhance, denoise, or sharpen the bottle.\n" +
      "- Do NOT alter label fonts, colors, kerning, fine print, or logos.\n" +
      "- Do NOT crop or resize the canvas unless required to maintain aspect ratio.\n" +
      "- Do NOT apply global filters that touch the protected subject region.\n\n" +

      "ACCEPTANCE CRITERIA:\n" +
      "- Bottle is exactly centered; background size/aspect preserved.\n" +
      "- Bottle text and details are identical to original pixels.\n" +
      "- Lighting is consistent WITHOUT adding shadows or rim effects.\n\n" +

      "OPTIONAL ADD-ONS:\n" +
      "- Scale: Set bottle height to exactly 27% of canvas height, then center.\n" +
      "- Background-only color cast: Subtly shift background toward the bottle's key-light temperature; keep bottle's white point unchanged.\n" +
      "- Noise match: Match grain/noise on BACKGROUND ONLY to the bottle's noise level; do not touch subject pixels.";

    return basePrompt;
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default FreepikCompositeProvider;
