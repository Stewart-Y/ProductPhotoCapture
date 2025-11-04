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
  async submitEditRequest({ imageBuffer, prompt }) {
    try {
      // Convert image buffer to base64
      const imageBase64 = imageBuffer.toString('base64');

      // FIXED: API uses 'reference_images' array, not 'image' string
      const payload = {
        prompt,
        reference_images: [imageBase64], // Array of base64 images (max 5)
        guidance_scale: 7.5 // How closely to follow prompt (0-20, default 2.5)
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
