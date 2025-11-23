/**
 * Nano Banana Pro AI Composite Provider (via OpenRouter)
 *
 * Uses Google's Gemini 3 Pro Image (Nano Banana Pro) via OpenRouter
 * to intelligently composite product cutouts onto background scenes.
 *
 * Key Features:
 * - Industry-leading text/label preservation (best for product bottles)
 * - Superior multimodal reasoning and real-world grounding
 * - High-fidelity visual synthesis with 2K/4K support
 * - Consistent multi-image blending with identity preservation
 * - Fine-grained creative controls (localized edits, lighting, focus)
 * - Fast processing via OpenRouter's reliable infrastructure
 */

import fetch from 'node-fetch';
import sharp from 'sharp';
import { getStorage } from '../../storage/index.js';

export class NanoBananaCompositeProvider {
  constructor({ apiKey }) {
    if (!apiKey) {
      throw new Error('OpenRouter API key is required');
    }

    this.apiKey = apiKey;
    this.apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
    this.modelId = 'google/gemini-3-pro-image-preview';
  }

  /**
   * AI-powered composite using Nano Banana Pro
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

    console.log('[NanoBananaPro] Starting AI-powered composite', {
      sku,
      theme,
      cutoutS3Key,
      backgroundS3Key
    });

    try {
      const storage = getStorage();

      // Step 1: Download cutout and background from S3
      console.log('[NanoBananaPro] Downloading images from S3...');
      const [cutoutBuffer, backgroundBuffer] = await Promise.all([
        this.downloadFromS3(storage, cutoutS3Key),
        this.downloadFromS3(storage, backgroundS3Key)
      ]);

      console.log('[NanoBananaPro] Downloaded:', {
        cutoutSize: `${(cutoutBuffer.length / 1024).toFixed(2)}KB`,
        backgroundSize: `${(backgroundBuffer.length / 1024).toFixed(2)}KB`
      });

      // Step 2: Resize images to max 2048px (Nano Banana limit)
      console.log('[NanoBananaPro] Resizing images to 2048px max...');
      const [resizedCutout, resizedBackground] = await Promise.all([
        sharp(cutoutBuffer)
          .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
          .png()
          .toBuffer(),
        sharp(backgroundBuffer)
          .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 90 })
          .toBuffer()
      ]);

      console.log('[NanoBananaPro] Resized:', {
        cutoutSize: `${(resizedCutout.length / 1024).toFixed(2)}KB`,
        backgroundSize: `${(resizedBackground.length / 1024).toFixed(2)}KB`
      });

      // Step 3: Convert images to base64
      const cutoutBase64 = resizedCutout.toString('base64');
      const backgroundBase64 = resizedBackground.toString('base64');

      // Step 4: Detect if background is simple/solid color
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

      console.log('[NanoBananaPro] Submitting to Nano Banana AI...', {
        prompt: prompt.substring(0, 100) + '...',
        isSimpleBackground
      });

      // Step 6: Submit to Nano Banana API
      const result = await this.submitCompositeRequest({
        cutoutBase64,
        backgroundBase64,
        prompt,
        isSimpleBackground
      });

      if (!result.success) {
        throw new Error(result.error || 'AI composite failed');
      }

      console.log('[NanoBananaPro] AI generation complete, downloading result...');

      // Step 6: Download generated composite (already base64)
      const compositeBuffer = Buffer.from(result.imageBase64, 'base64');

      // Step 7: Upload to S3
      const aspect = options.aspect || '1x1';
      const type = options.type || 'master';
      const compositeS3Key = storage.getCompositeKey(sku, sha256, theme, aspect, variant, 'nanobanana');

      console.log('[NanoBananaPro] Uploading to S3:', compositeS3Key);
      await storage.uploadBuffer(compositeS3Key, compositeBuffer, 'image/jpeg');

      // Step 8: Generate presigned URL
      const compositeS3Url = await storage.getPresignedGetUrl(compositeS3Key, 3600);

      const duration = Date.now() - startTime;

      console.log('[NanoBananaPro] Composite complete:', {
        sku,
        theme,
        s3Key: compositeS3Key,
        duration: `${duration}ms`,
        cost: '$0.0300' // Nano Banana Pro cost per generation
      });

      return {
        success: true,
        s3Key: compositeS3Key,
        s3Url: compositeS3Url,
        metadata: {
          duration,
          size: compositeBuffer.length,
          provider: 'nanobanana-pro',
          model: 'gemini-3-pro-image-preview'
        },
        cost: 0.03 // $0.03 per Nano Banana Pro generation
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      console.error('[NanoBananaPro] Composite failed:', {
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
   * Submit composite request to OpenRouter (Gemini 2.5 Flash Image) with retry logic
   */
  async submitCompositeRequest({ cutoutBase64, backgroundBase64, prompt, isSimpleBackground = false }) {
    const maxRetries = 3;
    const initialDelay = 2000; // 2 seconds
    const backoffMultiplier = 2;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // OpenRouter uses OpenAI-compatible chat completion format
        // Use inpainting-style instructions (Google Gemini best practices)
        const instructions = `${prompt}\n\nKeep everything exactly the same as in the source images, preserving the original style, lighting, and composition. The bottle from the second image should be placed onto the first image with all its details maintained precisely.`;

        const payload = {
          model: this.modelId,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: instructions
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/jpeg;base64,${backgroundBase64}`
                  }
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/png;base64,${cutoutBase64}`
                  }
                }
              ]
            }
          ],
          max_tokens: 1024,
          temperature: isSimpleBackground ? 0.3 : 0.7 // Lower temperature for literal placement
        };

        console.log(`[NanoBanana/OpenRouter] Submit attempt ${attempt}/${maxRetries}`);

        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'https://productphotos.click',
            'X-Title': 'Product Photo Capture'
          },
          body: JSON.stringify(payload),
          timeout: 120000 // 120 second timeout for image generation
        });

        if (!response.ok) {
          const errorText = await response.text();
          const error = new Error(`OpenRouter API error (${response.status}): ${errorText}`);

          // Retry on 502/503/504 (temporary server errors)
          if ([502, 503, 504].includes(response.status) && attempt < maxRetries) {
            const delay = initialDelay * Math.pow(backoffMultiplier, attempt - 1);
            console.warn(`[NanoBanana/OpenRouter] Temporary error ${response.status}, retrying in ${delay}ms...`);
            await this.sleep(delay);
            continue; // Retry
          }

          throw error;
        }

        const result = await response.json();

        // OpenRouter returns chat completion with image in message.images[] array
        // Extract image from response
        const message = result.choices?.[0]?.message;
        if (!message) {
          throw new Error(`No message in response: ${JSON.stringify(result)}`);
        }

        // Parse image data - OpenRouter puts images in message.images[] array
        let imageBase64 = null;

        // First check message.images array (OpenRouter format)
        if (message.images && Array.isArray(message.images) && message.images.length > 0) {
          const imageObj = message.images[0];
          if (imageObj.type === 'image_url' && imageObj.image_url?.url) {
            // Extract base64 from data URL
            const match = imageObj.image_url.url.match(/^data:image\/[^;]+;base64,(.+)$/);
            if (match) {
              imageBase64 = match[1];
            }
          }
        }

        // Fallback: check message.content array
        if (!imageBase64 && Array.isArray(message.content)) {
          for (const part of message.content) {
            if (part.type === 'image_url' && part.image_url?.url) {
              const match = part.image_url.url.match(/^data:image\/[^;]+;base64,(.+)$/);
              if (match) {
                imageBase64 = match[1];
                break;
              }
            }
          }
        }

        // Fallback: check string content
        if (!imageBase64 && typeof message.content === 'string') {
          const match = message.content.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/);
          if (match) {
            imageBase64 = match[1];
          }
        }

        if (!imageBase64) {
          throw new Error(`No image data in response: ${JSON.stringify(result)}`);
        }

        console.log(`[NanoBanana/OpenRouter] ✅ Request successful on attempt ${attempt}`);

        return {
          success: true,
          imageBase64
        };

      } catch (error) {
        console.error(`[NanoBanana/OpenRouter] Submit attempt ${attempt}/${maxRetries} failed:`, error.message);

        // If this is the last attempt, return the error
        if (attempt >= maxRetries) {
          return {
            success: false,
            error: error.message
          };
        }

        // Otherwise, wait and retry
        const delay = initialDelay * Math.pow(backoffMultiplier, attempt - 1);
        console.log(`[NanoBanana/OpenRouter] Retrying in ${delay}ms...`);
        await this.sleep(delay);
      }
    }

    // Should never reach here, but just in case
    return {
      success: false,
      error: 'Max retries exceeded'
    };
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
      console.error('[NanoBananaPro] S3 download failed:', { s3Key, error: error.message });
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

      console.log('[NanoBananaPro] Background complexity analysis:', {
        avgVariance: avgVariance.toFixed(2),
        isSimple,
        threshold: 100
      });

      return isSimple;

    } catch (error) {
      console.error('[NanoBananaPro] Background analysis failed:', error.message);
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
   * Following Google's official Gemini 3 Pro best practices:
   * - Descriptive narrative style (not keyword lists or structured tasks)
   * - Explicit multi-image reference syntax
   * - Conversational scene descriptions
   * - Spatial clarity for element placement
   */
  buildUniversalCompositePrompt(theme) {
    const basePrompt =
      "Create a professional product photograph by combining the two provided images. " +
      "Take the product bottle from Image 1 and place it perfectly centered in the scene from Image 2. " +

      "The bottle from Image 1 must remain completely unchanged—preserve every detail including the exact label text, typography, logos, barcodes, glass texture, cap details, and foil accents exactly as they appear in the original. " +
      "Do not regenerate, redraw, or modify any part of the bottle. The label text must be pixel-accurate with no changes to fonts, colors, or kerning. " +

      "Position the bottle in the center of the composition from Image 2, maintaining the full canvas size and aspect ratio of the background scene. " +
      "The background should extend naturally around the bottle, keeping all of Image 2's original atmosphere, depth, and composition intact. " +

      "To create a cohesive final image, adjust only the background's lighting to harmonize with the bottle's existing illumination—modify the background's exposure, contrast, white balance, and color temperature so the lighting feels natural and consistent. " +
      "Do not apply any lighting changes to the bottle itself. " +

      "The compositing must be clean and seamless with smooth, anti-aliased edges where the bottle meets the background—no halos, no color fringing, no glowing edges. " +

      "Critical: Do not add any shadows, cast shadows, drop shadows, reflections, ground contact shadows, or depth effects around or beneath the bottle. " +
      "The bottle should appear to naturally exist in the scene without any additional shadow simulation. " +

      "Output a single, final composite image with the bottle centered, the background fully visible at its native resolution, and no borders or watermarks. " +
      "The result should look like a professional product photograph where the bottle and background lighting naturally match, but without any artificial shadows or effects.";

    return basePrompt;
  }

  /**
   * Enhance lighting on an existing composite image
   * Used for Sharp Workflow + Nano Banana combined flow
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

    console.log('[NanoBananaPro] Starting lighting enhancement', {
      sku,
      compositeS3Key,
      theme,
      variant
    });

    try {
      const storage = getStorage();

      // Step 1: Download Sharp composite from S3
      console.log('[NanoBananaPro] Downloading Sharp composite from S3');
      const compositeUrl = await storage.getPresignedGetUrl(compositeS3Key, 300);
      const compositeBuffer = await this.downloadFromS3(storage, compositeS3Key);

      console.log('[NanoBananaPro] Sharp composite downloaded', {
        size: `${(compositeBuffer.length / 1024).toFixed(2)}KB`
      });

      // Step 2: Resize to max 2048px (Nano Banana limit)
      console.log('[NanoBananaPro] Resizing composite to 2048px max...');
      const resizedComposite = await sharp(compositeBuffer)
        .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toBuffer();

      // Step 3: Convert to base64
      const compositeBase64 = resizedComposite.toString('base64');

      // Step 4: Build lighting enhancement prompt
      const prompt = this.getLightingPrompt(theme);

      console.log('[NanoBananaPro] Using lighting enhancement prompt', {
        prompt: prompt.substring(0, 100) + '...'
      });

      // Step 5: Submit to Nano Banana for lighting enhancement
      const result = await this.submitLightingRequest({
        compositeBase64,
        prompt
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error,
          provider: 'NanoBanana',
          cost: 0
        };
      }

      console.log('[NanoBananaPro] AI lighting enhancement complete');

      // Step 6: Download enhanced image
      const enhancedBuffer = Buffer.from(result.imageBase64, 'base64');

      // Step 7: Upload to S3 (final composite with lighting)
      const enhancedS3Key = storage.getCompositeKey(
        sku,
        sha256,
        theme,
        '1x1',
        variant,
        'nanobanana-enhanced'
      );

      console.log('[NanoBananaPro] Uploading enhanced composite to S3', {
        s3Key: enhancedS3Key,
        size: enhancedBuffer.length
      });

      await storage.uploadBuffer(enhancedS3Key, enhancedBuffer, 'image/jpeg');

      // Step 8: Generate presigned URL
      const s3Url = await storage.getPresignedGetUrl(enhancedS3Key, 3600);

      const duration = Date.now() - startTime;

      console.log('[NanoBananaPro] Lighting enhancement complete:', {
        sku,
        theme,
        s3Key: enhancedS3Key,
        duration: `${duration}ms`,
        cost: '$0.0300'
      });

      return {
        success: true,
        s3Key: enhancedS3Key,
        s3Url,
        provider: 'NanoBanana',
        cost: 0.03,
        metadata: {
          duration,
          theme,
          prompt,
          workflow: 'sharp_nanobanana_lighting',
          sharpCompositeS3Key: compositeS3Key,
          combinedFlow: true
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('[NanoBananaPro] Lighting enhancement failed', {
        sku,
        error: error.message,
        duration: `${duration}ms`
      });

      return {
        success: false,
        error: error.message,
        provider: 'NanoBanana',
        cost: 0
      };
    }
  }

  /**
   * Submit lighting enhancement request to Nano Banana
   */
  async submitLightingRequest({ compositeBase64, prompt }) {
    const maxRetries = 3;
    const initialDelay = 2000;
    const backoffMultiplier = 2;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const instructions = `${prompt}\n\nPreserve the product and background exactly as shown. Only adjust lighting, shadows, and ambient effects to create a more professional, photorealistic appearance.`;

        const payload = {
          model: this.modelId,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: instructions
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/jpeg;base64,${compositeBase64}`
                  }
                }
              ]
            }
          ],
          max_tokens: 1024,
          temperature: 0.4 // Lower temperature for subtle lighting adjustments
        };

        console.log(`[NanoBanana/OpenRouter] Lighting enhancement attempt ${attempt}/${maxRetries}`);

        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'https://productphotos.click',
            'X-Title': 'Product Photo Capture'
          },
          body: JSON.stringify(payload),
          timeout: 120000
        });

        if (!response.ok) {
          const errorText = await response.text();
          const error = new Error(`OpenRouter API error (${response.status}): ${errorText}`);

          if ([502, 503, 504].includes(response.status) && attempt < maxRetries) {
            const delay = initialDelay * Math.pow(backoffMultiplier, attempt - 1);
            console.warn(`[NanoBanana/OpenRouter] Temporary error ${response.status}, retrying in ${delay}ms...`);
            await this.sleep(delay);
            continue;
          }

          throw error;
        }

        const result = await response.json();
        const message = result.choices?.[0]?.message;

        if (!message) {
          throw new Error(`No message in response: ${JSON.stringify(result)}`);
        }

        // Extract image from response
        let imageBase64 = null;

        if (message.images && Array.isArray(message.images) && message.images.length > 0) {
          const imageObj = message.images[0];
          if (imageObj.type === 'image_url' && imageObj.image_url?.url) {
            const match = imageObj.image_url.url.match(/^data:image\/[^;]+;base64,(.+)$/);
            if (match) {
              imageBase64 = match[1];
            }
          }
        }

        if (!imageBase64 && Array.isArray(message.content)) {
          for (const part of message.content) {
            if (part.type === 'image_url' && part.image_url?.url) {
              const match = part.image_url.url.match(/^data:image\/[^;]+;base64,(.+)$/);
              if (match) {
                imageBase64 = match[1];
                break;
              }
            }
          }
        }

        if (!imageBase64 && typeof message.content === 'string') {
          const match = message.content.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/);
          if (match) {
            imageBase64 = match[1];
          }
        }

        if (!imageBase64) {
          throw new Error(`No image data in response: ${JSON.stringify(result)}`);
        }

        console.log(`[NanoBanana/OpenRouter] ✅ Lighting enhancement successful on attempt ${attempt}`);

        return {
          success: true,
          imageBase64
        };

      } catch (error) {
        console.error(`[NanoBanana/OpenRouter] Attempt ${attempt}/${maxRetries} failed:`, error.message);

        if (attempt >= maxRetries) {
          return {
            success: false,
            error: error.message
          };
        }

        const delay = initialDelay * Math.pow(backoffMultiplier, attempt - 1);
        console.log(`[NanoBanana/OpenRouter] Retrying in ${delay}ms...`);
        await this.sleep(delay);
      }
    }

    return {
      success: false,
      error: 'Max retries exceeded'
    };
  }

  /**
   * Get lighting enhancement prompts (more subtle than full composite)
   * Following Nano Banana Pro (Gemini 3 Pro) best practices:
   * - Conversational, detailed language
   * - Explicit preservation cues ("keep bottle unchanged")
   * - Specific lighting details (color temp, direction, style)
   * - Reference "provided image" to avoid regeneration
   */
  getLightingPrompt(theme) {
    const prompts = {
      default: 'Using the provided image of the bottle, adjust only the lighting to simulate soft studio illumination with gentle top and front softbox light and subtle shadows. Keep the bottle and its label exactly as in the original image - preserve the label text, logo, colors, and shape pixel-accurately. Only change the lighting: add even white balance with diffuse shadows to create professional e-commerce quality depth and realism.',

      kitchen: 'Using the provided image of the bottle on a wooden surface, adjust only the lighting to mimic warm indoor ambient light at approximately 3000K color temperature (soft yellow lamp light from the side, gentle warm shadows as if a kitchen window provides natural light). Keep the bottle, its label text, and logo completely unchanged and preserve all typography pixel-accurately. Only adjust the scene lighting to match the warm kitchen atmosphere with soft amber glow and diffuse shadows.',

      outdoors: 'Using the provided image of the bottle, adjust only the lighting to simulate bright outdoor daylight with clear blue sky and strong sunlight. Add crisp directional shadows as if from midday sun at approximately 5500K color temperature, with natural outdoor brightness and atmospheric depth. Keep the bottle, logo, and label text exactly as in the original - preserve the product design and typography without any changes. Only change the lighting to match sunny day conditions with warm golden-hour backlight if late afternoon.',

      minimal: 'Using the provided image of the bottle on a clean white seamless background, adjust only the lighting to a bright studio setup with softbox from above providing even illumination and very subtle shadows on the backdrop. Keep the bottle shape, label text, colors, and all design elements identical to the original image. Only change the background lighting to create a clean minimalist aesthetic with subtle studio lighting and soft gradients, maintaining the product completely unchanged.',

      luxury: 'Using the provided image of the bottle, adjust only the lighting to create dramatic premium illumination with elegant shadow play - add a low-angle key light creating upscale atmosphere with rich contrast and sophisticated depth. Keep the bottle and its label completely unchanged, preserving all text legibility, font, logo, and colors exactly. Only adjust the scene lighting to simulate high-end product photography with warm accent lighting at approximately 3200K and dramatic shadows for an elegant, upscale feel.'
    };

    return prompts[theme] || prompts.default;
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default NanoBananaCompositeProvider;
