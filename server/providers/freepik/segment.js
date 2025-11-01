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
   * Remove background from product image
   * Returns S3 URL to the segmented image (transparent PNG)
   */
  async removeBackground({ imageUrl, sku, sha256 }) {
    const startTime = Date.now();
    this.log('info', 'Starting background removal', { sku, sha256 });

    try {
      // Step 1: Call Freepik API
      const freepikResult = await this.callFreepikAPI(imageUrl);

      if (!freepikResult.success) {
        return {
          success: false,
          error: freepikResult.error,
          provider: this.name,
          cost: 0
        };
      }

      // Step 2: Immediately download from Freepik (5-minute window!)
      this.log('info', 'Downloading result from Freepik', {
        url: freepikResult.url,
        expiryWarning: 'URL expires in 5 minutes'
      });

      const imageBuffer = await this.downloadImage(freepikResult.url);

      // Step 3: Upload to S3 with deterministic key
      const storage = getStorage();
      const s3Key = storage.getMaskKey(sku, sha256);

      this.log('info', 'Uploading to S3', { s3Key, size: imageBuffer.length });

      await storage.uploadBuffer(s3Key, imageBuffer, 'image/png');

      // Step 4: Generate presigned URL for access
      const s3Url = await storage.getPresignedGetUrl(s3Key, 3600); // 1 hour

      const duration = Date.now() - startTime;
      const cost = this.calculateCost('remove-background');

      this.log('info', 'Background removal complete', {
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
