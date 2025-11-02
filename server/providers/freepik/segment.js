/**
 * Freepik Background Removal Provider
 *
 * Uses Freepik's remove-background API to segment product images
 * CRITICAL: Freepik URLs expire after 5 minutes, so we immediately download and upload to S3
 */

import fetch from 'node-fetch';
import { BaseProvider } from '../base.js';
import { getStorage } from '../../storage/index.js';

export class FreepikSegmentProvider extends BaseProvider {
  constructor(config = {}) {
    super({
      ...config,
      name: 'FreepikSegment'
    });

    this.apiUrl = 'https://api.freepik.com/v1/ai/beta/remove-background';
    this.validateConfig();
  }

  /**
   * Remove background from product image (Flow v2)
   * Returns BOTH cutout (alpha PNG) AND mask (binary mask)
   */
  async removeBackground({ imageUrl, sku, sha256 }) {
    const startTime = Date.now();
    this.log('info', 'Starting background removal', { sku, sha256 });

    try {
      // Step 0: Download image from URL first (to handle S3 presigned URLs and CORS issues)
      // Freepik API may have trouble accessing S3 presigned URLs
      this.log('info', 'Downloading image from source URL', { imageUrl });
      const imageBuffer = await this.downloadImage(imageUrl);

      // Step 1: Call Freepik API with the actual image buffer
      const freepikResult = await this.callFreepikAPIWithBuffer(imageBuffer);

      if (!freepikResult.success) {
        return {
          success: false,
          error: freepikResult.error,
          provider: this.name,
          cost: 0
        };
      }

      // Step 2: Immediately download from Freepik (5-minute window!)
      this.log('info', 'Downloading cutout from Freepik', {
        url: freepikResult.url,
        expiryWarning: 'URL expires in 5 minutes'
      });

      const cutoutBuffer = await this.downloadImage(freepikResult.url);

      // Step 3: Generate mask from cutout alpha channel (Flow v2)
      this.log('info', 'Extracting alpha channel to create mask');

      const maskBuffer = await this.extractAlphaMask(cutoutBuffer);

      // Step 4: Upload BOTH cutout and mask to S3 (Flow v2)
      const storage = getStorage();

      const cutoutS3Key = storage.getCutoutKey(sku, sha256);
      const maskS3Key = storage.getMaskKey(sku, sha256);

      this.log('info', 'Uploading cutout and mask to S3', {
        cutoutKey: cutoutS3Key,
        maskKey: maskS3Key,
        cutoutSize: cutoutBuffer.length,
        maskSize: maskBuffer.length
      });

      // Upload both in parallel
      await Promise.all([
        storage.uploadBuffer(cutoutS3Key, cutoutBuffer, 'image/png'),
        storage.uploadBuffer(maskS3Key, maskBuffer, 'image/png')
      ]);

      // Step 5: Generate presigned URLs for access
      const [cutoutS3Url, maskS3Url] = await Promise.all([
        storage.getPresignedGetUrl(cutoutS3Key, 3600),
        storage.getPresignedGetUrl(maskS3Key, 3600)
      ]);

      const duration = Date.now() - startTime;
      const cost = this.calculateCost('remove-background');

      this.log('info', 'Background removal complete', {
        sku,
        sha256,
        cutoutKey: cutoutS3Key,
        maskKey: maskS3Key,
        duration: `${duration}ms`,
        cost: `$${cost.toFixed(4)}`
      });

      return {
        success: true,
        // Flow v2: return both cutout and mask
        cutout: {
          s3Key: cutoutS3Key,
          s3Url: cutoutS3Url
        },
        mask: {
          s3Key: maskS3Key,
          s3Url: maskS3Url
        },
        // Legacy compatibility (Flow v1)
        s3Key: maskS3Key,
        s3Url: maskS3Url,
        provider: this.name,
        cost,
        metadata: {
          duration,
          width: freepikResult.width,
          height: freepikResult.height,
          format: 'png'
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.log('error', 'Background removal failed', {
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
   * Call Freepik remove-background API
   */
  /**
   * Call Freepik API with image buffer (multipart form data)
   * This works better for S3 presigned URLs and avoids CORS issues
   * Uses native Node.js FormData (v18.12.0+) - no external dependency needed
   */
  async callFreepikAPIWithBuffer(imageBuffer) {
    try {
      const form = new FormData();
      // Create a Blob from the buffer for FormData
      // NOTE: Freepik API expects field name 'image_file' (not 'image')
      const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
      form.append('image_file', blob, 'image.jpg');

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'x-freepik-api-key': this.apiKey
        },
        body: form
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Freepik API error (${response.status}): ${errorText}`);
      }

      const result = await response.json();

      this.log('debug', 'Freepik API response', { result });

      if (!result.url) {
        throw new Error(`Invalid response from Freepik API: ${JSON.stringify(result)}`);
      }

      return {
        success: true,
        url: result.url,
        highRes: result.high_resolution,
        preview: result.preview,
        original: result.original,
        width: null,
        height: null
      };

    } catch (error) {
      this.log('error', 'Freepik API call failed', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  async callFreepikAPI(imageUrl) {
    try {
      // Freepik expects application/x-www-form-urlencoded
      const params = new URLSearchParams();
      params.append('image_url', imageUrl);

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'x-freepik-api-key': this.apiKey,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Freepik API error (${response.status}): ${errorText}`);
      }

      const result = await response.json();

      // Debug: log the actual response structure
      this.log('debug', 'Freepik API response', { result });

      // Response format (actual from Freepik):
      // {
      //   "original": "url",
      //   "high_resolution": "url",
      //   "preview": "url",
      //   "url": "url"
      // }

      if (!result.url) {
        throw new Error(`Invalid response from Freepik API: ${JSON.stringify(result)}`);
      }

      return {
        success: true,
        url: result.url,
        highRes: result.high_resolution,
        preview: result.preview,
        original: result.original,
        // Note: Freepik may not return dimensions in response
        // We'll get them when we process the image
        width: null,
        height: null
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
   * Extract alpha channel as binary mask (Flow v2)
   * Converts RGBA cutout to grayscale mask (white = product, black = background)
   */
  async extractAlphaMask(cutoutBuffer) {
    try {
      const sharp = (await import('sharp')).default;

      // Extract alpha channel and convert to grayscale mask
      const maskBuffer = await sharp(cutoutBuffer)
        .extractChannel('alpha')  // Extract alpha channel
        .toColorspace('b-w')      // Convert to black & white
        .png()                     // Output as PNG
        .toBuffer();

      return maskBuffer;

    } catch (error) {
      this.log('error', 'Failed to extract alpha mask', { error: error.message });
      throw error;
    }
  }

  /**
   * Calculate cost per operation
   * Based on Freepik pricing (update as needed)
   */
  calculateCost(operation) {
    const costs = {
      'remove-background': 0.02 // $0.02 per operation (estimate)
    };

    return costs[operation] || 0;
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

export default FreepikSegmentProvider;
