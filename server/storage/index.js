/**
 * Storage Factory
 * Returns S3 or local filesystem storage based on configuration
 */

import getS3Storage from './s3.js';

/**
 * Get storage client (currently only S3 supported)
 * Future: Add local filesystem fallback for development
 *
 * @param {object} config - Storage configuration
 * @returns {S3Storage} Storage client instance
 */
export function getStorage(config = {}) {
  const storageType = config.type || process.env.STORAGE_TYPE || 's3';

  switch (storageType) {
    case 's3':
      return getS3Storage(config);

    case 'local':
      // TODO: Implement local filesystem storage for development
      throw new Error('Local storage not yet implemented. Use S3.');

    default:
      throw new Error(`Unknown storage type: ${storageType}`);
  }
}

export default getStorage;
