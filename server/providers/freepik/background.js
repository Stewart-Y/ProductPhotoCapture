/**
 * Freepik Background Generation Provider
 *
 * Uses Freepik's Mystic API to generate themed backgrounds
 * CRITICAL: Freepik URLs expire after 5 minutes, so we immediately download and upload to S3
 */

import fetch from 'node-fetch';
import { BaseProvider } from '../base.js';
import { getStorage } from '../../storage/index.js';

export class FreepikBackgroundProvider extends BaseProvider {
  constructor(config = {}) {
    super({
      ...config,
      name: 'FreepikBackground'
    });

    this.apiUrl = 'https://api.freepik.com/v1/ai/mystic';
    this.validateConfig();
  }

  /**
   * Generate themed background image
   */
  async generateBackground({ theme, sku, sha256, dimensions, aspectRatio, customPrompt, variant = 1 }) {
    const startTime = Date.now();
    this.log('info', 'Starting background generation', { theme, sku, sha256, variant, customPrompt });

    try {
      // Step 1: Build prompt from theme or use custom prompt
      let prompt;
      if (customPrompt) {
        // Enhance user's custom prompt to ensure background-only generation
        prompt = this.enhanceCustomPrompt(customPrompt);
      } else {
        prompt = this.getThemePrompt(theme);
      }

      // Step 2: Determine resolution and aspect ratio
      const resolution = this.selectResolution(dimensions);
      const aspect = aspectRatio || this.calculateAspectRatio(dimensions);

      this.log('info', 'Generation parameters', {
        theme,
        prompt: prompt.substring(0, 100) + '...',
        resolution,
        aspectRatio: aspect,
        customPrompt: !!customPrompt
      });

      // Step 3: Submit generation request (async)
      const submissionResult = await this.submitGenerationRequest({
        prompt,
        resolution,
        aspectRatio: aspect
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
      const freepikResult = await this.pollForCompletion(submissionResult.taskId);

      if (!freepikResult.success) {
        return {
          success: false,
          error: freepikResult.error,
          provider: this.name,
          cost: 0
        };
      }

      // Step 4: Immediately download from Freepik (5-minute window!)
      this.log('info', 'Downloading generated background', {
        url: freepikResult.url,
        expiryWarning: 'URL expires in 5 minutes'
      });

      const imageBuffer = await this.downloadImage(freepikResult.url);

      // Step 5: Upload to S3 with deterministic key
      const storage = getStorage();
      const s3Key = storage.getBackgroundKey(sku, sha256, theme, variant);

      this.log('info', 'Uploading to S3', { s3Key, variant, size: imageBuffer.length });

      await storage.uploadBuffer(s3Key, imageBuffer, 'image/jpeg');

      // Step 6: Generate presigned URL for access
      const s3Url = await storage.getPresignedGetUrl(s3Key, 3600); // 1 hour

      const duration = Date.now() - startTime;
      const cost = this.calculateCost('generate', resolution);

      this.log('info', 'Background generation complete', {
        theme,
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
          resolution,
          aspectRatio: aspect,
          format: 'jpeg'
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.log('error', 'Background generation failed', {
        theme,
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
   * Submit generation request to Freepik Mystic API (async, returns task_id)
   */
  async submitGenerationRequest({ prompt, resolution, aspectRatio }) {
    try {
      const payload = {
        prompt,
        resolution, // '2k' or '4k'
        aspect_ratio: aspectRatio, // e.g., 'square_1_1', 'widescreen_16_9'
        model: 'zen', // CHANGED: zen model generates fewer objects (was 'realism')
        engine: 'magnific_illusio', // Options: automatic, magnific_illusio, magnific_sharpy, magnific_sparkle
        creative_detailing: 33, // FIXED: API uses 0-100 scale, not 0-10 (was 5)
        guidance_scale: 7.5, // How closely to follow prompt
        num_inference_steps: 50, // Quality vs speed tradeoff
        seed: null // Random seed for reproducibility (null = random)
      };

      this.log('debug', 'Submitting generation request to Freepik Mystic API', { payload });

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
        throw new Error(`Freepik API error (${response.status}): ${errorText}`);
      }

      const result = await response.json();

      this.log('debug', 'Freepik API submission response', { result });

      // Expected format: { data: { task_id: "...", status: "CREATED", generated: [] } }
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
      this.log('error', 'Freepik API submission failed', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Poll for generation completion with exponential backoff
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
            throw new Error(`Generation completed but no URL found: ${JSON.stringify(result)}`);
          }

          this.log('info', 'Generation completed successfully', {
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
          throw new Error(`Generation failed with status: ${status}`);
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
   * Sleep helper for polling
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Download image from URL to buffer
   * Must be fast to avoid 5-minute expiry!
   */
  async downloadImage(url) {
    try {
      const response = await fetch(url, {
        timeout: 30000 // 30 second timeout
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
      this.log('error', 'Image download failed', { url, error: error.message });
      throw error;
    }
  }

  /**
   * Select resolution based on dimensions
   */
  selectResolution(dimensions) {
    if (!dimensions) return '2k'; // Default

    const maxDim = Math.max(dimensions.width || 0, dimensions.height || 0);

    // Use 4k for larger images if within budget
    if (maxDim >= 2048) {
      return '4k';
    }

    return '2k';
  }

  /**
   * Calculate aspect ratio from dimensions
   * Freepik accepted values: square_1_1, classic_4_3, traditional_3_4, widescreen_16_9,
   * social_story_9_16, smartphone_horizontal_20_9, smartphone_vertical_9_20,
   * film_horizontal_21_9, film_vertical_9_21, standard_3_2, portrait_2_3,
   * horizontal_2_1, vertical_1_2, social_5_4, social_post_4_5
   */
  calculateAspectRatio(dimensions) {
    if (!dimensions || !dimensions.width || !dimensions.height) {
      return 'square_1_1'; // Default square
    }

    const { width, height } = dimensions;
    const ratio = width / height;

    // Map to Freepik's aspect ratio values
    if (Math.abs(ratio - 1) < 0.1) return 'square_1_1';
    if (Math.abs(ratio - 16/9) < 0.1) return 'widescreen_16_9';
    if (Math.abs(ratio - 4/3) < 0.1) return 'classic_4_3';
    if (Math.abs(ratio - 3/4) < 0.1) return 'traditional_3_4';
    if (Math.abs(ratio - 9/16) < 0.1) return 'social_story_9_16';
    if (Math.abs(ratio - 3/2) < 0.1) return 'standard_3_2';
    if (Math.abs(ratio - 2/3) < 0.1) return 'portrait_2_3';
    if (Math.abs(ratio - 2/1) < 0.1) return 'horizontal_2_1';
    if (Math.abs(ratio - 1/2) < 0.1) return 'vertical_1_2';
    if (Math.abs(ratio - 5/4) < 0.1) return 'social_5_4';
    if (Math.abs(ratio - 4/5) < 0.1) return 'social_post_4_5';

    // Default to closest standard ratio
    if (ratio > 1) return 'widescreen_16_9'; // Landscape
    return 'social_story_9_16'; // Portrait
  }

  /**
   * Calculate cost per operation
   * Based on Freepik pricing (update as needed)
   */
  calculateCost(operation, resolution) {
    const costs = {
      'generate': {
        '2k': 0.05, // $0.05 per 2k image (estimate)
        '4k': 0.10  // $0.10 per 4k image (estimate)
      }
    };

    return costs[operation]?.[resolution] || 0.05;
  }

  /**
   * Enhance custom prompt to ensure background-only generation (no products)
   * IMPORTANT: Freepik Mystic API does NOT support negative prompts
   * Use ONLY positive descriptions of what you WANT, not what you DON'T want
   */
  enhanceCustomPrompt(userPrompt) {
    // Remove any mentions of "bottle" or "product" from user's prompt
    const cleanedPrompt = userPrompt
      .replace(/leave the bottle as it is,?\s*/gi, '')
      .replace(/bottle,?\s*/gi, '')
      .replace(/product,?\s*/gi, '')
      .replace(/let the background be/gi, '')
      .replace(/dont?\s+generate\s+items?,?\s*/gi, '')
      .replace(/dont?\s+generate\s+objects?,?\s*/gi, '')
      .replace(/no\s+objects?,?\s*/gi, '')
      .replace(/no\s+products?,?\s*/gi, '')
      .replace(/just\s+background,?\s*/gi, '')
      .replace(/and\s+/gi, ' ')
      .trim();

    // Build enhanced prompt using ONLY positive language
    // Focus on describing empty spaces and background elements at periphery
    return `Product photography background scene with ${cleanedPrompt} theme. Empty center foreground with vacant placement space, clear unoccupied surface in sharp focus. Background scenic elements pushed to edges and periphery, blurred background depth, shallow depth of field. Professional studio photography setup, commercial quality, photorealistic rendering, cinematic lighting with key and fill lights creating empty foreground area ready for product placement.`;
  }

  /**
   * Theme prompts with POSITIVE-ONLY language
   * Freepik Mystic API does NOT support negative prompts
   */
  getThemePrompt(theme) {
    const prompts = {
      default: {
        positive: 'Professional product photography empty background scene, vacant center foreground space ready for placement, soft gradient backdrop fading from light to slightly darker tone, clean smooth surface in sharp focus. Studio lighting setup with key and fill lights illuminating empty foreground area, high quality commercial photography, photorealistic rendering, subtle texture, depth of field with blurred edges, background elements at periphery.'
      },
      kitchen: {
        positive: 'Modern kitchen scene background for product photography, empty premium marble or granite countertop surface in center foreground, vacant placement area with clear space. Blurred kitchen appliances and cabinetry visible in background periphery, natural window lighting from side creating soft glow, warm ambient kitchen atmosphere. Professional photography setup, shallow depth of field, bokeh effect with sharp empty foreground ready for product.'
      },
      outdoors: {
        positive: 'Natural outdoor product photography background, empty weathered wooden table or stone surface in center foreground, vacant placement space with clear area. Blurred nature elements in background with green foliage bokeh, soft natural sunlight with gentle shadows, golden hour warm lighting. Rustic setting with background scenic elements at edges, shallow depth of field, sharp empty foreground surface ready for product placement.'
      },
      minimal: {
        positive: 'Minimalist empty product photography background, pure solid color gradient backdrop, ultra clean vacant space, smooth surface without texture. Perfect gradient fade from light to slightly deeper tone, studio photography lighting, high key commercial setup, professional clean aesthetic, empty foreground area, simple and uncluttered composition ready for product.'
      },
      luxury: {
        positive: 'Luxury empty product photography background, dark elegant backdrop with subtle gold or brass accent elements visible at periphery edges, vacant center foreground space. Dramatic edge lighting creating sophisticated atmosphere, premium velvet or silk textures visible in blurred background, high-end commercial photography setup. Shallow depth of field with sharp empty foreground area, sophisticated dark ambiance ready for product placement.'
      },
      christmas: {
        positive: 'Festive Christmas holiday product photography background, empty wooden table or surface in center foreground with vacant placement space, clear area ready for product. Blurred Christmas decorations in background periphery including pine branches with twinkling lights, red and green ornaments, bokeh effect from fairy lights. Warm cozy holiday atmosphere with soft golden lighting, rustic wooden surface in sharp focus, Christmas tree lights and garland visible but blurred in distant background. Professional photography setup with shallow depth of field, inviting festive ambiance.'
      },
      halloween: {
        positive: 'Spooky Halloween themed product photography background, empty dark wooden surface or vintage table in center foreground, vacant placement area with clear space. Blurred Halloween decorations in background periphery including carved pumpkins with glowing faces, autumn leaves, cobwebs, dim atmospheric lighting with orange and purple accent lights. Moody dramatic atmosphere with fog effect in background, dark rustic surface in sharp focus. Professional photography setup with shallow depth of field, mysterious spooky Halloween ambiance ready for product placement.'
      }
    };

    const selected = prompts[theme] || prompts.default;
    return selected.positive;
  }

  /**
   * Validate Freepik-specific configuration
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

export default FreepikBackgroundProvider;
