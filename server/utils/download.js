/**
 * Download Utility
 * 
 * Downloads files from remote URLs with streaming, error handling, and retries.
 */

import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 60000; // 60s for large files
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

/**
 * Download a file from a URL to a local path
 * @param {string} url - Source URL
 * @param {string} destPath - Destination file path
 * @param {Object} options - Download options
 * @param {number} [options.maxRetries=3] - Maximum retry attempts
 * @param {number} [options.timeout=60000] - Request timeout in ms
 * @returns {Promise<{path: string, size: number}>}
 */
export async function downloadFile(url, destPath, options = {}) {
  const maxRetries = options.maxRetries ?? MAX_RETRIES;
  const timeout = options.timeout ?? REQUEST_TIMEOUT_MS;

  // Ensure destination directory exists
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`[Download] Retrying download after ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      console.log(`[Download] Downloading ${url} to ${destPath}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Check content length
        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
          throw new Error(`File too large: ${contentLength} bytes (max: ${MAX_FILE_SIZE})`);
        }

        // Stream to file
        const fileStream = createWriteStream(destPath);
        let downloadedBytes = 0;

        // Use pipeline for proper error handling
        await pipeline(
          response.body,
          async function* (source) {
            for await (const chunk of source) {
              downloadedBytes += chunk.length;
              if (downloadedBytes > MAX_FILE_SIZE) {
                throw new Error(`File exceeds maximum size: ${MAX_FILE_SIZE} bytes`);
              }
              yield chunk;
            }
          },
          fileStream
        );

        console.log(`[Download] Successfully downloaded ${downloadedBytes} bytes`);

        // Verify file exists and has content
        const stats = fs.statSync(destPath);
        if (stats.size === 0) {
          throw new Error('Downloaded file is empty');
        }

        return {
          path: destPath,
          size: stats.size,
        };
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    } catch (error) {
      lastError = error;

      // Clean up partial file
      if (fs.existsSync(destPath)) {
        try {
          fs.unlinkSync(destPath);
        } catch (unlinkError) {
          console.error(`[Download] Failed to clean up partial file:`, unlinkError);
        }
      }

      // Don't retry on certain errors
      if (error.name === 'AbortError') {
        console.error(`[Download] Request timeout after ${timeout}ms`);
      } else if (error.message.includes('File too large')) {
        console.error(`[Download] File too large, not retrying`);
        throw error;
      } else {
        console.error(`[Download] Attempt ${attempt + 1} failed:`, error.message);
      }

      // If this was the last attempt, throw
      if (attempt === maxRetries) {
        break;
      }
    }
  }

  throw new Error(`Failed to download file after ${maxRetries + 1} attempts: ${lastError.message}`);
}

/**
 * Download to a temporary file with auto-generated name
 * @param {string} url - Source URL
 * @param {string} tempDir - Temporary directory
 * @param {string} [extension='.tmp'] - File extension
 * @returns {Promise<{path: string, size: number}>}
 */
export async function downloadToTemp(url, tempDir, extension = '.tmp') {
  // Ensure temp directory exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Generate unique temp filename
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  const tempFilename = `download_${timestamp}_${random}${extension}`;
  const tempPath = path.join(tempDir, tempFilename);

  return downloadFile(url, tempPath);
}
