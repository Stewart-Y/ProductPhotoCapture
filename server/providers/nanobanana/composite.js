/**
 * Nano Banana AI Composite Provider (via OpenRouter)
 *
 * Uses Google's Gemini 2.5 Flash Image (Nano Banana) via OpenRouter
 * to intelligently composite product cutouts onto background scenes.
 *
 * Key Features:
 * - Superior text/label preservation (better for product bottles)
 * - Realistic product placement
 * - Fast processing via OpenRouter's reliable infrastructure
 * - Cost: $0.03 per image
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
    this.modelId = 'google/gemini-2.5-flash-image';
  }

  /**
   * AI-powered composite using Nano Banana
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

    console.log('[NanoBanana] Starting AI-powered composite', {
      sku,
      theme,
      cutoutS3Key,
      backgroundS3Key
    });

    try {
      const storage = getStorage();

      // Step 1: Download cutout and background from S3
      console.log('[NanoBanana] Downloading images from S3...');
      const [cutoutBuffer, backgroundBuffer] = await Promise.all([
        this.downloadFromS3(storage, cutoutS3Key),
        this.downloadFromS3(storage, backgroundS3Key)
      ]);

      console.log('[NanoBanana] Downloaded:', {
        cutoutSize: `${(cutoutBuffer.length / 1024).toFixed(2)}KB`,
        backgroundSize: `${(backgroundBuffer.length / 1024).toFixed(2)}KB`
      });

      // Step 2: Resize images to max 2048px (Nano Banana limit)
      console.log('[NanoBanana] Resizing images to 2048px max...');
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

      console.log('[NanoBanana] Resized:', {
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

      console.log('[NanoBanana] Submitting to Nano Banana AI...', {
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

      console.log('[NanoBanana] AI generation complete, downloading result...');

      // Step 6: Download generated composite (already base64)
      const compositeBuffer = Buffer.from(result.imageBase64, 'base64');

      // Step 7: Upload to S3
      const aspect = options.aspect || '1x1';
      const type = options.type || 'master';
      const compositeS3Key = storage.getCompositeKey(sku, sha256, theme, aspect, variant, 'nanobanana');

      console.log('[NanoBanana] Uploading to S3:', compositeS3Key);
      await storage.uploadBuffer(compositeS3Key, compositeBuffer, 'image/jpeg');

      // Step 8: Generate presigned URL
      const compositeS3Url = await storage.getPresignedGetUrl(compositeS3Key, 3600);

      const duration = Date.now() - startTime;

      console.log('[NanoBanana] Composite complete:', {
        sku,
        theme,
        s3Key: compositeS3Key,
        duration: `${duration}ms`,
        cost: '$0.0300' // Nano Banana cost per generation
      });

      return {
        success: true,
        s3Key: compositeS3Key,
        s3Url: compositeS3Url,
        metadata: {
          duration,
          size: compositeBuffer.length,
          provider: 'nanobanana',
          model: 'gemini-2.5-flash-image'
        },
        cost: 0.03 // $0.03 per Nano Banana generation
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      console.error('[NanoBanana] Composite failed:', {
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
        // Use different instructions based on background complexity
        const instructions = isSimpleBackground
          ? `${prompt}\n\nCRITICAL INSTRUCTIONS:\n- Place the transparent product cutout EXACTLY onto the background WITHOUT ANY MODIFICATIONS\n- DO NOT regenerate, redraw, or alter the product in any way\n- DO NOT change, modify, or regenerate ANY text, labels, or logos on the product\n- Keep ALL product details EXACTLY as they appear in the cutout image\n- Keep the background EXACTLY as provided without adding any new elements\n- Only add a subtle natural shadow beneath the product for realism\n- The product cutout is FINAL and must be placed as-is\n\nIMAGE QUALITY ENHANCEMENT:\n- Generate the final composite in the highest possible quality and resolution\n- Ensure sharp, crisp details throughout the entire image\n- Optimize clarity, sharpness, and overall image quality\n- Maintain excellent color accuracy and dynamic range\n- Produce a professional, high-definition result suitable for e-commerce`
          : `${prompt}\n\nCRITICAL INSTRUCTIONS:\n- Place the transparent product cutout onto the background scene\n- DO NOT regenerate or redraw the product - use it EXACTLY as provided\n- DO NOT modify ANY text, labels, logos, or details on the product bottle\n- Keep ALL product text and labels EXACTLY as they appear in the original cutout\n- Only adjust lighting, shadows, and environmental integration around the product\n- The product itself must remain untouched and unmodified\n- Create realistic shadows and reflections that complement the scene\n\nIMAGE QUALITY ENHANCEMENT:\n- Generate the final composite in the highest possible quality and resolution\n- Ensure sharp, crisp details throughout the entire image\n- Optimize clarity, sharpness, and overall image quality\n- Maintain excellent color accuracy and dynamic range\n- Produce a professional, high-definition result suitable for e-commerce`;

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
      console.error('[NanoBanana] S3 download failed:', { s3Key, error: error.message });
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

      console.log('[NanoBanana] Background complexity analysis:', {
        avgVariance: avgVariance.toFixed(2),
        isSimple,
        threshold: 100
      });

      return isSimple;

    } catch (error) {
      console.error('[NanoBanana] Background analysis failed:', error.message);
      return false; // Default to complex if analysis fails
    }
  }

  /**
   * Build AI composite prompt for SIMPLE backgrounds (literal placement)
   */
  buildSimpleCompositePrompt(theme) {
    return "Place the product in the center of the provided background. Use the background exactly as provided without modification.";
  }

  /**
   * Build AI composite prompt for COMPLEX backgrounds (creative integration)
   */
  buildCompositePrompt(theme) {
    const basePrompt = "Realistically composite the product bottle into the background scene. ";

    const themePrompts = {
      kitchen: "Place the product naturally on the kitchen counter with realistic lighting, shadows, and reflections. The product should look like it naturally belongs in this kitchen setting.",
      outdoors: "Place the product on the outdoor surface with natural lighting and shadows that match the environment. The product should integrate seamlessly with the outdoor scene.",
      minimal: "Place the product in the center with clean, minimal composition. Maintain crisp product details and labels.",
      luxury: "Place the product elegantly in the luxury setting with sophisticated lighting and premium atmosphere.",
      default: "Place the product naturally in the scene with realistic shadows, lighting, and depth. Preserve all product details including text and labels."
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

export default NanoBananaCompositeProvider;
