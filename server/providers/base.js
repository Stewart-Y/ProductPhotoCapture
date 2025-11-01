/**
 * Base Provider Interface
 *
 * All AI providers must implement this interface to ensure consistent behavior
 * across different services (Freepik, Replicate, etc.)
 */

export class BaseProvider {
  constructor(config = {}) {
    this.config = config;
    this.apiKey = config.apiKey;
    this.name = config.name || 'unknown';
  }

  /**
   * Remove background from an image
   *
   * @param {Object} params
   * @param {string} params.imageUrl - URL to the source image
   * @param {string} params.sku - Product SKU for logging/tracking
   * @param {string} params.sha256 - Image hash for deterministic S3 keys
   * @returns {Promise<Object>} Result object with:
   *   - success: boolean
   *   - s3Key: string - S3 key where mask is stored
   *   - s3Url: string - Presigned URL to access the mask
   *   - provider: string - Provider name
   *   - cost: number - API call cost in USD
   *   - metadata: Object - Provider-specific metadata (dimensions, etc.)
   *   - error: string (if success=false)
   */
  async removeBackground({ imageUrl, sku, sha256 }) {
    throw new Error(`${this.name}: removeBackground() not implemented`);
  }

  /**
   * Generate themed background image
   *
   * @param {Object} params
   * @param {string} params.theme - Theme name (e.g., 'default', 'kitchen', 'outdoors')
   * @param {string} params.sku - Product SKU for logging/tracking
   * @param {string} params.sha256 - Image hash for deterministic S3 keys
   * @param {Object} params.dimensions - Optional: { width, height } from original/mask
   * @param {string} params.aspectRatio - Optional: '1:1', '16:9', etc.
   * @returns {Promise<Object>} Result object with:
   *   - success: boolean
   *   - s3Key: string - S3 key where background is stored
   *   - s3Url: string - Presigned URL to access the background
   *   - provider: string - Provider name
   *   - cost: number - API call cost in USD
   *   - metadata: Object - Provider-specific metadata
   *   - error: string (if success=false)
   */
  async generateBackground({ theme, sku, sha256, dimensions, aspectRatio }) {
    throw new Error(`${this.name}: generateBackground() not implemented`);
  }

  /**
   * Get theme-specific prompt for background generation
   *
   * @param {string} theme - Theme name
   * @returns {string} - Prompt text for AI generation
   */
  getThemePrompt(theme) {
    const prompts = {
      default: 'Professional product photography background, clean and modern, soft gradient, studio lighting, high quality, photorealistic',
      kitchen: 'Modern kitchen counter background, marble or granite surface, natural window lighting, blurred depth of field, professional product photography',
      outdoors: 'Natural outdoor setting, wooden table or stone surface, soft sunlight, bokeh background, professional product photography, nature-inspired',
      // Add more themes as needed
    };

    return prompts[theme] || prompts.default;
  }

  /**
   * Validate configuration
   * Throws if required config is missing
   */
  validateConfig() {
    if (!this.apiKey) {
      throw new Error(`${this.name}: API key is required`);
    }
  }

  /**
   * Log provider activity
   */
  log(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${this.name}] [${level.toUpperCase()}] ${message}`, meta);
  }
}

export default BaseProvider;
