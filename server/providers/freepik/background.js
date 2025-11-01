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
  async generateBackground({ theme, sku, sha256, dimensions, aspectRatio }) {
    const startTime = Date.now();
    this.log('info', 'Starting background generation', { theme, sku, sha256 });

    try {
      // Step 1: Build prompt from theme
      const prompt = this.getThemePrompt(theme);

      // Step 2: Determine resolution and aspect ratio
      const resolution = this.selectResolution(dimensions);
      const aspect = aspectRatio || this.calculateAspectRatio(dimensions);

      this.log('info', 'Generation parameters', {
        theme,
        prompt: prompt.substring(0, 100) + '...',
        resolution,
        aspectRatio: aspect
      });

      // Step 3: Call Freepik API
      const freepikResult = await this.callFreepikAPI({
        prompt,
        resolution,
        aspectRatio: aspect
      });

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
      const s3Key = storage.getBackgroundKey(sku, sha256, theme);

      this.log('info', 'Uploading to S3', { s3Key, size: imageBuffer.length });

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
   * Call Freepik Mystic API
   */
  async callFreepikAPI({ prompt, resolution, aspectRatio }) {
    try {
      const payload = {
        prompt,
        resolution, // '2k' or '4k'
        aspect_ratio: aspectRatio, // e.g., 'square_1_1', 'widescreen_16_9'
        model: 'realism', // Options: fluid, realism, zen, flexible, super_real, editorial_portraits
        engine: 'magnific_illusio', // Options: automatic, magnific_illusio, magnific_sharpy, magnific_sparkle
        creative_detailing: 5, // 0-10 scale, 5 is balanced
        guidance_scale: 7.5, // How closely to follow prompt
        num_inference_steps: 50, // Quality vs speed tradeoff
        seed: null // Random seed for reproducibility (null = random)
      };

      this.log('debug', 'Calling Freepik Mystic API', { payload });

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

      // Debug: log the actual response structure
      this.log('debug', 'Freepik API response', { result });

      // Response format might be:
      // Option 1: { data: { url: "...", id: "..." } }
      // Option 2: { url: "...", id: "..." }
      // Option 3: { image: { url: "..." } }

      let imageUrl;
      let imageId;

      if (result.data && result.data.url) {
        imageUrl = result.data.url;
        imageId = result.data.id;
      } else if (result.url) {
        imageUrl = result.url;
        imageId = result.id;
      } else if (result.image && result.image.url) {
        imageUrl = result.image.url;
        imageId = result.image.id || result.id;
      } else {
        throw new Error(`Invalid response from Freepik API: ${JSON.stringify(result)}`);
      }

      return {
        success: true,
        url: imageUrl,
        id: imageId
      };

    } catch (error) {
      this.log('error', 'Freepik API call failed', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
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
   * Enhanced theme prompts with negative prompts
   */
  getThemePrompt(theme) {
    const prompts = {
      default: {
        positive: 'Professional product photography background, clean and modern aesthetic, soft gradient from light to slightly darker tone, studio lighting setup with key light and fill light, high quality commercial photography, photorealistic rendering, subtle texture, depth of field',
        negative: 'busy, cluttered, distracting elements, text, watermarks, people, hands, faces'
      },
      kitchen: {
        positive: 'Modern kitchen counter setting, premium marble or granite countertop surface, natural window lighting from the side, warm ambient lighting, blurred background with kitchen appliances, professional product photography, shallow depth of field, bokeh effect, high-end residential kitchen',
        negative: 'messy, dirty, old appliances, harsh shadows, direct flash, cluttered counters, food stains'
      },
      outdoors: {
        positive: 'Natural outdoor setting for product photography, rustic wooden table or weathered stone surface, soft natural sunlight with gentle shadows, blurred nature background with green foliage, bokeh effect, golden hour lighting, professional commercial photography, serene atmosphere',
        negative: 'harsh sunlight, overexposed, dark shadows, artificial elements, modern furniture, urban setting'
      },
      minimal: {
        positive: 'Minimalist product photography background, pure solid color, ultra clean, no texture, perfect gradient, studio photography, professional commercial lighting, high key lighting',
        negative: 'texture, patterns, objects, shadows, grain, noise'
      },
      luxury: {
        positive: 'Luxury product photography setting, dark elegant background with gold or brass accents, dramatic lighting with edge lighting, premium materials like velvet or silk, high-end commercial photography, sophisticated atmosphere, shallow depth of field',
        negative: 'cheap, plastic, bright colors, casual setting, harsh lighting'
      }
    };

    const selected = prompts[theme] || prompts.default;

    // Combine positive and negative (if API supports negative prompts)
    // For now, just return positive prompt
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
