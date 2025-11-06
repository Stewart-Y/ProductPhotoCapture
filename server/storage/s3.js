import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

/**
 * S3 Storage Client
 * Handles all S3 operations with presigned URL support
 */
class S3Storage {
  constructor(config = {}) {
    this.bucket = config.bucket || process.env.S3_BUCKET;
    this.region = config.region || process.env.AWS_REGION || 'us-east-1';

    // Validate required configuration
    if (!this.bucket) {
      throw new Error(
        'S3_BUCKET environment variable is required. ' +
        'Please set S3_BUCKET in your .env file. ' +
        'See .env.example for reference.'
      );
    }

    this.publicBase = config.publicBase || process.env.S3_PUBLIC_BASE ||
      `https://${this.bucket}.s3.${this.region}.amazonaws.com`;
    this.presignedUrlExpiry = config.presignedUrlExpiry ||
      parseInt(process.env.S3_PRESIGNED_URL_EXPIRY || '3600', 10);

    // Initialize S3 client
    // Uses AWS CLI credentials automatically from ~/.aws/credentials or environment variables
    this.client = new S3Client({
      region: this.region,
      credentials: config.credentials || undefined // Falls back to default credential chain
    });

    console.log(`[S3Storage] Initialized: bucket=${this.bucket}, region=${this.region}`);
  }

  /**
   * Generate deterministic S3 key for original image
   * Pattern: originals/{sku}/{sha256}.jpg
   */
  getOriginalKey(sku, sha256) {
    return `originals/${sku}/${sha256}.jpg`;
  }

  /**
   * Generate deterministic S3 key for mask
   * Pattern: masks/{sku}/{sha256}.png
   */
  getMaskKey(sku, sha256) {
    return `masks/${sku}/${sha256}.png`;
  }

  /**
   * Generate deterministic S3 key for cutout (Flow v2)
   * Pattern: cutouts/{sku}/{sha256}.png
   */
  getCutoutKey(sku, sha256) {
    return `cutouts/${sku}/${sha256}.png`;
  }

  /**
   * Generate deterministic S3 key for background
   * Pattern: backgrounds/{theme}/{sku}/{sha256}_{variant}.jpg
   */
  getBackgroundKey(sku, sha256, theme = 'default', variant = 1) {
    return `backgrounds/${theme}/${sku}/${sha256}_${variant}.jpg`;
  }

  /**
   * Generate deterministic S3 key for composite
   * Pattern: composites/{theme}/{sku}/{sha256}_{aspect}_{variant}_{type}.jpg
   * aspect: 1x1, 4x5
   * type: master, shopify
   */
  getCompositeKey(sku, sha256, theme = 'default', aspect = '1x1', variant = 1, type = 'master') {
    return `composites/${theme}/${sku}/${sha256}_${aspect}_${variant}_${type}.jpg`;
  }

  /**
   * Generate deterministic S3 key for thumbnail
   * Pattern: thumbs/{sku}/{sha256}_400.jpg
   */
  getThumbnailKey(sku, sha256) {
    return `thumbs/${sku}/${sha256}_400.jpg`;
  }

  /**
   * Generate deterministic S3 key for derivative (Flow v2)
   * Pattern: derivatives/{theme}/{sku}/{sha256}/{variant}_{size}.{ext}
   * Examples:
   *   derivatives/default/VWS200433868/abc123.../1_hero.jpg
   *   derivatives/default/VWS200433868/abc123.../1_pdp.webp
   *   derivatives/default/VWS200433868/abc123.../1_thumb.avif
   */
  getDerivativeKey(sku, sha256, theme = 'default', variant = 1, size = 'hero', ext = 'jpg') {
    return `derivatives/${theme}/${sku}/${sha256}/${variant}_${size}.${ext}`;
  }

  /**
   * Generate deterministic S3 key for manifest (Flow v2)
   * Pattern: manifests/{sku}/{sha256}-{theme}.json
   */
  getManifestKey(sku, sha256, theme = 'default') {
    return `manifests/${sku}/${sha256}-${theme}.json`;
  }

  /**
   * Generate presigned PUT URL (for uploading)
   * @param {string} key - S3 object key
   * @param {string} contentType - MIME type (e.g., 'image/jpeg')
   * @param {number} expiresIn - URL expiry in seconds (default: 3600)
   * @returns {Promise<string>} Presigned URL
   */
  async getPresignedPutUrl(key, contentType = 'image/jpeg', expiresIn = null) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType
    });

    const url = await getSignedUrl(this.client, command, {
      expiresIn: expiresIn || this.presignedUrlExpiry
    });

    console.log(`[S3Storage] Generated presigned PUT URL: ${key} (expires in ${expiresIn || this.presignedUrlExpiry}s)`);
    return url;
  }

  /**
   * Generate presigned GET URL (for downloading)
   * @param {string} key - S3 object key
   * @param {number} expiresIn - URL expiry in seconds (default: 3600)
   * @returns {Promise<string>} Presigned URL
   */
  async getPresignedGetUrl(key, expiresIn = null) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key
    });

    const url = await getSignedUrl(this.client, command, {
      expiresIn: expiresIn || this.presignedUrlExpiry
    });

    console.log(`[S3Storage] Generated presigned GET URL: ${key} (expires in ${expiresIn || this.presignedUrlExpiry}s)`);
    return url;
  }

  /**
   * Upload file directly from buffer or stream
   * @param {string} key - S3 object key
   * @param {Buffer|Stream} body - File content
   * @param {string} contentType - MIME type
   * @returns {Promise<object>} Upload result
   */
  async upload(key, body, contentType = 'image/jpeg') {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType
    });

    const result = await this.client.send(command);
    console.log(`[S3Storage] Uploaded: ${key}`);
    return result;
  }

  /**
   * Alias for upload() for consistency with provider interface
   */
  async uploadBuffer(key, buffer, contentType = 'image/jpeg') {
    return this.upload(key, buffer, contentType);
  }

  /**
   * Delete object from S3
   * @param {string} key - S3 object key
   * @returns {Promise<object>} Delete result
   */
  async delete(key) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key
    });

    const result = await this.client.send(command);
    console.log(`[S3Storage] Deleted: ${key}`);
    return result;
  }

  /**
   * Get public URL for an S3 object (non-presigned)
   * Only works if bucket has public read access (not recommended)
   * @param {string} key - S3 object key
   * @returns {string} Public URL
   */
  getPublicUrl(key) {
    return `${this.publicBase}/${key}`;
  }

  /**
   * Calculate SHA256 hash of a file buffer
   * Used for generating deterministic keys
   * @param {Buffer} buffer - File buffer
   * @returns {string} SHA256 hex string
   */
  static sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Test S3 connection by attempting to list bucket
   * @returns {Promise<boolean>} True if connection successful
   */
  async testConnection() {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: 'test/connection-test.txt',
        Body: 'Connection test successful!',
        ContentType: 'text/plain'
      });

      await this.client.send(command);
      console.log('[S3Storage] ✅ Connection test successful');

      // Clean up test file
      await this.delete('test/connection-test.txt');
      return true;
    } catch (error) {
      console.error('[S3Storage] ❌ Connection test failed:', error.message);
      return false;
    }
  }
}

// Export singleton instance
let instance = null;

export function getS3Storage(config = {}) {
  if (!instance) {
    instance = new S3Storage(config);
  }
  return instance;
}

export default getS3Storage;
