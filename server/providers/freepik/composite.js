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
    this.apiUrl = 'https://api.freepik.com/v1/ai/seedream-v4-edit';
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

      // Step 4: Build AI composite prompt
      const prompt = options.customPrompt || this.buildCompositePrompt(theme);

      console.log('[FreepikComposite] Submitting to Seedream AI...', {
        prompt: prompt.substring(0, 100) + '...'
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
        reference_images: [backgroundBase64, cutoutBase64], // Background first, then cutout
        guidance_scale: 7.5 // How closely to follow prompt (0-20)
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
      const taskId = result.data?.id || result.id;

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
   * Build AI composite prompt based on theme
   */
  buildCompositePrompt(theme) {
    const basePrompt = "Professional product photography with the product bottle centered and naturally integrated into the background scene. ";

    const themePrompts = {
      kitchen: "Realistic kitchen environment with natural lighting, soft shadows, and warm atmosphere. The product appears naturally placed on the kitchen counter.",
      outdoors: "Natural outdoor setting with beautiful lighting, the product seamlessly integrated into the scene with realistic shadows and ambient occlusion.",
      minimal: "Clean minimalist setting with subtle lighting, the product prominently displayed with professional studio quality.",
      luxury: "Elegant luxury setting with sophisticated lighting, the product showcased in a premium environment with refined details.",
      default: "Clean professional setting with balanced lighting, the product naturally placed in the scene with realistic shadows and depth."
    };

    return basePrompt + (themePrompts[theme] || themePrompts.default);
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default FreepikCompositeProvider;
