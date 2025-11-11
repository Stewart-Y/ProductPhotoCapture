/**
 * Freepik Seedream 4 Edit Provider
 *
 * Uses Freepik's Seedream 4 Edit API for single-step background replacement
 * Replaces background while preserving product in one AI operation
 *
 * API: POST /v1/ai/text-to-image/seedream-v4-edit
 */

import fetch from 'node-fetch';
import { BaseProvider } from '../base.js';
import { getStorage } from '../../storage/index.js';

export class FreepikSeedreamProvider extends BaseProvider {
  constructor(config = {}) {
    super({
      ...config,
      name: 'FreepikSeedream'
    });

    this.apiUrl = 'https://api.freepik.com/v1/ai/text-to-image/seedream-v4-edit';
    this.validateConfig();
  }

  /**
   * Edit image background while preserving product
   * Single-step AI editing (no compositing needed)
   */
  async editBackground({ imageUrl, theme, sku, sha256, customPrompt, variant = 1 }) {
    const startTime = Date.now();
    this.log('info', 'Starting Seedream 4 Edit background replacement', { sku, sha256, theme, variant });

    try {
      // Step 1: Download original image to buffer
      this.log('info', 'Downloading original image', { imageUrl });
      const imageBuffer = await this.downloadImage(imageUrl);

      // Step 2: Build background replacement prompt
      const prompt = customPrompt
        ? this.enhanceCustomPrompt(customPrompt)
        : this.getThemePrompt(theme);

      this.log('info', 'Using prompt', {
        prompt: prompt.substring(0, 100) + '...',
        customPrompt: !!customPrompt
      });

      // Step 3: Submit edit request to Seedream 4 Edit API
      const submissionResult = await this.submitEditRequest({
        imageBuffer,
        prompt
      });

      if (!submissionResult.success) {
        return {
          success: false,
          error: submissionResult.error,
          provider: this.name,
          cost: 0
        };
      }

      // Step 4: Poll for completion
      const editResult = await this.pollForCompletion(submissionResult.taskId);

      if (!editResult.success) {
        return {
          success: false,
          error: editResult.error,
          provider: this.name,
          cost: 0
        };
      }

      // Step 5: Download edited image from Freepik (5-minute expiry!)
      this.log('info', 'Downloading edited image', {
        url: editResult.url.substring(0, 80) + '...',
        expiryWarning: 'URL expires in 5 minutes'
      });

      const editedBuffer = await this.downloadImage(editResult.url);

      // Step 6: Upload to S3
      const storage = getStorage();

      // Store as composite (final output) since no compositing step needed
      const s3Key = storage.getCompositeKey(sku, sha256, theme, '1x1', variant, 'seedream');

      this.log('info', 'Uploading edited image to S3', {
        s3Key,
        size: editedBuffer.length
      });

      await storage.uploadBuffer(s3Key, editedBuffer, 'image/jpeg');

      // Step 7: Generate presigned URL
      const s3Url = await storage.getPresignedGetUrl(s3Key, 3600);

      const duration = Date.now() - startTime;
      const cost = this.calculateCost('edit');

      this.log('info', 'Seedream 4 Edit complete', {
        sku,
        sha256,
        s3Key,
        duration: `${duration}ms`,
        cost: `$${cost.toFixed(4)}`
      });

      return {
        success: true,
        s3Key,
        s3Url,
        provider: this.name,
        cost,
        metadata: {
          duration,
          theme,
          prompt,
          workflow: 'seedream_edit',
          format: 'jpeg'
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.log('error', 'Seedream 4 Edit failed', {
        sku,
        sha256,
        error: error.message,
        duration: `${duration}ms`
      });

      return {
        success: false,
        error: error.message,
        provider: this.name,
        cost: 0
      };
    }
  }

  /**
   * Submit edit request to Seedream 4 Edit API
   */
  async submitEditRequest({ imageBuffer, prompt, guidanceScale = 7.5 }) {
    try {
      // Convert image buffer to base64
      const imageBase64 = imageBuffer.toString('base64');

      // FIXED: API uses 'reference_images' array, not 'image' string
      const payload = {
        prompt,
        reference_images: [imageBase64], // Array of base64 images (max 5)
        guidance_scale: guidanceScale // How closely to follow prompt (0-20, default 7.5)
      };

      this.log('debug', 'Submitting edit request to Seedream 4 Edit API', {
        prompt: prompt.substring(0, 80) + '...',
        imageSize: imageBuffer.length
      });

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'x-freepik-api-key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Freepik Seedream API error (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      this.log('debug', 'Seedream API submission response', { result });

      const data = result.data || result;
      const taskId = data.task_id || data.id;

      if (!taskId) {
        throw new Error(`No task_id in response: ${JSON.stringify(result)}`);
      }

      return {
        success: true,
        taskId,
        status: data.status
      };

    } catch (error) {
      this.log('error', 'Seedream API submission failed', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Poll for completion
   * Polls task-specific endpoint: GET /seedream-v4-edit/{task_id}
   */
  async pollForCompletion(taskId) {
    const maxAttempts = 40; // ~2 minutes max
    const initialInterval = 2000; // Start with 2 seconds
    const maxInterval = 10000; // Cap at 10 seconds
    const backoffMultiplier = 1.5;

    let attempts = 0;
    let pollInterval = initialInterval;

    this.log('info', 'Starting polling for task completion', { taskId, maxAttempts });

    while (attempts < maxAttempts) {
      attempts++;

      try {
        // Poll task-specific endpoint (URL path includes task_id)
        const pollUrl = `${this.apiUrl}/${taskId}`;
        const response = await fetch(pollUrl, {
          method: 'GET',
          headers: {
            'x-freepik-api-key': this.apiKey
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Poll failed (${response.status}): ${errorText}`);
        }

        const result = await response.json();
        const data = result.data || result;
        const status = (data.status || '').toUpperCase();

        this.log('debug', `Poll attempt ${attempts}/${maxAttempts}`, { status });

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
            throw new Error(`Edit completed but no URL found: ${JSON.stringify(result)}`);
          }

          this.log('info', 'Edit completed successfully', {
            attempts,
            duration: `~${attempts * (pollInterval / 1000)}s`,
            url: imageUrl.substring(0, 80) + '...'
          });

          return {
            success: true,
            url: imageUrl
          };
        }

        // Check for failure
        if (status === 'FAILED' || status === 'ERROR') {
          throw new Error(`Edit failed with status: ${status}`);
        }

        // Still in progress, wait before next poll
        if (attempts < maxAttempts) {
          await this.sleep(pollInterval);
          // Exponential backoff
          pollInterval = Math.min(pollInterval * backoffMultiplier, maxInterval);
        }

      } catch (error) {
        this.log('error', 'Poll attempt failed', { attempt: attempts, error: error.message });
        // Don't throw immediately, let it retry
        if (attempts >= maxAttempts) {
          return {
            success: false,
            error: error.message
          };
        }
        await this.sleep(pollInterval);
      }
    }

    // Max attempts reached
    this.log('error', 'Max polling attempts reached', { taskId, maxAttempts });
    return {
      success: false,
      error: `Polling timeout after ${maxAttempts} attempts`
    };
  }

  /**
   * Download image from URL to buffer
   */
  async downloadImage(url) {
    try {
      const response = await fetch(url, {
        timeout: 30000
      });

      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length === 0) {
        throw new Error('Downloaded image is empty');
      }

      return buffer;

    } catch (error) {
      this.log('error', 'Image download failed', { url: url.substring(0, 80) + '...', error: error.message });
      throw error;
    }
  }

  /**
   * Sleep helper for polling
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Enhance custom prompt for background replacement
   */
  enhanceCustomPrompt(userPrompt) {
    return `Replace the background with: ${userPrompt}. Keep the product in center completely unchanged, preserve all product details exactly as they are, natural lighting that matches the product, photorealistic, professional product photography, high quality, 4k.`;
  }

  /**
   * Get theme-specific prompts for background replacement
   */
  getThemePrompt(theme) {
    const prompts = {
      default: 'Replace background with clean professional product photography background, soft gradient, studio lighting, neutral tones. Keep product centered and unchanged.',
      kitchen: 'Replace background with modern kitchen counter with marble surface, natural window lighting, blurred background. Keep product centered and unchanged.',
      outdoors: 'Replace background with natural outdoor setting, wooden table, soft sunlight, blurred nature background with bokeh. Keep product centered and unchanged.',
      minimal: 'Replace background with pure minimalist background, solid color gradient, clean and simple. Keep product centered and unchanged.',
      luxury: 'Replace background with luxury dark background with gold accents, dramatic edge lighting, elegant atmosphere. Keep product centered and unchanged.'
    };

    return prompts[theme] || prompts.default;
  }

  /**
   * Enhance lighting on an existing composite image
   * Used for Sharp Workflow + Seedream combined flow
   *
   * @param {Object} params
   * @param {string} params.compositeS3Key - S3 key for Sharp composite
   * @param {string} params.sku - Product SKU
   * @param {string} params.sha256 - Image hash
   * @param {string} params.theme - Theme name
   * @param {number} params.variant - Variant number
   * @returns {Promise<Object>} Enhanced composite result
   */
  async enhanceLighting({
    compositeS3Key,
    sku,
    sha256,
    theme = 'default',
    variant = 1
  }) {
    const startTime = Date.now();
    this.log('info', 'Starting Seedream lighting enhancement', {
      sku,
      compositeS3Key,
      theme,
      variant
    });

    try {
      const storage = getStorage();

      // Step 1: Download Sharp composite from S3
      this.log('info', 'Downloading Sharp composite from S3');
      const compositeUrl = await storage.getPresignedGetUrl(compositeS3Key, 300);
      const compositeBuffer = await this.downloadImage(compositeUrl);

      this.log('info', 'Sharp composite downloaded', {
        size: `${(compositeBuffer.length / 1024).toFixed(2)}KB`
      });

      // Step 2: Build lighting enhancement prompt
      const prompt = this.getLightingPrompt(theme);

      this.log('info', 'Using lighting enhancement prompt', {
        prompt: prompt.substring(0, 100) + '...'
      });

      // Step 3: Submit edit request to Seedream 4 Edit API
      const submissionResult = await this.submitEditRequest({
        imageBuffer: compositeBuffer,
        prompt,
        guidanceScale: 3.0 // Lower guidance for subtle lighting changes
      });

      if (!submissionResult.success) {
        return {
          success: false,
          error: submissionResult.error,
          provider: this.name,
          cost: 0
        };
      }

      // Step 4: Poll for completion
      const editResult = await this.pollForCompletion(submissionResult.taskId);

      if (!editResult.success) {
        return {
          success: false,
          error: editResult.error,
          provider: this.name,
          cost: 0
        };
      }

      // Step 5: Download enhanced image
      this.log('info', 'Downloading enhanced image');
      const enhancedBuffer = await this.downloadImage(editResult.url);

      // Step 6: Upload to S3 (final composite with lighting)
      const enhancedS3Key = storage.getCompositeKey(
        sku,
        sha256,
        theme,
        '1x1',
        variant,
        'seedream-enhanced'
      );

      this.log('info', 'Uploading enhanced composite to S3', {
        s3Key: enhancedS3Key,
        size: enhancedBuffer.length
      });

      await storage.uploadBuffer(enhancedS3Key, enhancedBuffer, 'image/jpeg');

      // Step 7: Generate presigned URL
      const s3Url = await storage.getPresignedGetUrl(enhancedS3Key, 3600);

      const duration = Date.now() - startTime;
      const cost = this.calculateCost('edit');

      this.log('info', 'Seedream lighting enhancement complete', {
        sku,
        theme,
        s3Key: enhancedS3Key,
        duration: `${duration}ms`,
        cost: `$${cost.toFixed(4)}`
      });

      return {
        success: true,
        s3Key: enhancedS3Key,
        s3Url,
        provider: this.name,
        cost,
        metadata: {
          duration,
          theme,
          prompt,
          workflow: 'sharp_seedream_lighting',
          sharpCompositeS3Key: compositeS3Key,
          combinedFlow: true
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.log('error', 'Seedream lighting enhancement failed', {
        sku,
        error: error.message,
        duration: `${duration}ms`
      });

      return {
        success: false,
        error: error.message,
        provider: this.name,
        cost: 0
      };
    }
  }

  /**
   * Get lighting enhancement prompts (more subtle than background replacement)
   * Following Seedream 4.0 / SeedEdit 3.0 best practices:
   * - Use "provided image" language
   * - Explicit preservation guardrails
   * - Specific lighting technical details
   * - Avoid global "enhance" or denoise on subject
   * - Focus on scene/background lighting changes only
   */
  getLightingPrompt(theme) {
    const prompts = {
      default: 'Using the provided image, adjust only the scene lighting to a neutral white seamless studio: soft, even illumination, gentle overhead softbox feel with a faint grounded shadow behind/under the bottle. Keep the bottle and its label pixel-accurate and unchanged—preserve label text, logos, edges, glass texture, and colors exactly. Do not modify the bottle at all. Limit edits to lighting, exposure, and shadows in the background and scene only.',

      kitchen: 'Using the provided image, match lighting to a warm indoor bar atmosphere: approximately 3000K tungsten ambiance, soft side light from the background, mild vignette, and background-only color balance shift. Leave the bottle untouched—preserve all label typography, embossing, cap details, and reflections. Add a subtle contact shadow on the surface consistent with the new light direction. Do not alter label typography, colors, shapes, or edges.',

      outdoors: 'Using the provided image, set bright outdoor daylight: cool sky fill with ~5500K color temperature, a single sun key producing a clean, directional shadow behind the bottle, and crisp contrast in the background only. Adjust only the lighting to midday outdoor sunlight with brighter exposure, cool ambient fill, and a defined ground shadow consistent with noon sun. Do not regenerate or stylize the bottle—keep all label text and graphics intact. Preserve the bottle pixels exactly—no generative changes to the subject.',

      minimal: 'Using the provided image, adjust only the background lighting to a bright, neutral white studio look. Add a soft overhead softbox feel and a faint grounded shadow behind/under the bottle. Keep the scene soft and minimalist with clean studio lighting and subtle gradients. Do not modify the bottle at all—preserve label text, logos, edges, glass texture, and colors exactly. Keep noise reduction minimal and avoid generative fill on the bottle.',

      luxury: 'Using the provided image, apply dramatic premium lighting in the background with controlled contrast: subtle neon night ambiance with soft magenta/teal rim cues and a gentle specular bloom away from the bottle. Add elegant shadow play and a low-angle key light creating upscale atmosphere. Maintain realistic exposure so the bottle remains readable. Preserve the bottle 100%—no alterations to lettering, logo edges, foil, or cap. Limit edits to lighting and shadows in the background only.'
    };

    return prompts[theme] || prompts.default;
  }

  /**
   * Calculate cost per operation
   * TODO: Research actual Seedream 4 Edit pricing from Freepik
   *
   * Estimated based on similar AI edit services:
   * - Low estimate: $0.05 per edit
   * - Mid estimate: $0.08 per edit
   * - High estimate: $0.12 per edit
   */
  calculateCost(operation) {
    const costs = {
      'edit': 0.08 // ESTIMATED - Verify with Freepik pricing
    };

    return costs[operation] || 0;
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    super.validateConfig();

    if (!this.apiKey.startsWith('FPSX')) {
      this.log('warn', 'API key does not start with FPSX prefix', {
        prefix: this.apiKey.substring(0, 4)
      });
    }
  }
}

export default FreepikSeedreamProvider;
