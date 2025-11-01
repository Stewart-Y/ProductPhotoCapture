/**
 * Test Compositing Workflow
 *
 * Tests the Sharp-based compositing without requiring Freepik background generation
 * Uses the mask we already created from Freepik segmentation
 */

import dotenv from 'dotenv';
import sharp from 'sharp';
import { compositeImage } from './workflows/composite.js';
import { getStorage } from './storage/index.js';

dotenv.config();

async function testCompositing() {
  console.log('========================================');
  console.log('COMPOSITING WORKFLOW TEST');
  console.log('========================================\n');

  try {
    const storage = getStorage();

    // Use the mask we created in previous tests
    const maskS3Key = 'masks/TEST-E2E-001/e2e-test-hash-123.png';

    console.log('Step 1: Creating test background');
    console.log('------------------------------------------');

    // Create a simple gradient background for testing
    const width = 1024;
    const height = 1024;

    const testBackground = await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 240, g: 240, b: 250 } // Light blue-gray
      }
    })
      .jpeg({ quality: 90 })
      .toBuffer();

    console.log(`✓ Created test background: ${width}x${height}`);

    // Upload test background to S3
    const bgS3Key = 'backgrounds/test/TEST-E2E-001/e2e-test-hash-123_1.jpg';
    await storage.uploadBuffer(bgS3Key, testBackground, 'image/jpeg');
    console.log(`✓ Uploaded to S3: ${bgS3Key}\n`);

    console.log('Step 2: Running compositing workflow');
    console.log('------------------------------------------');

    const result = await compositeImage({
      maskS3Key,
      backgroundS3Key: bgS3Key,
      sku: 'TEST-E2E-001',
      sha256: 'e2e-test-hash-123',
      theme: 'test',
      variant: 1,
      options: {
        quality: 90,
        format: 'jpeg'
      }
    });

    if (!result.success) {
      throw new Error(`Compositing failed: ${result.error}`);
    }

    console.log('\n✅ COMPOSITING SUCCESSFUL!');
    console.log('========================================');
    console.log('Result:');
    console.log(`  S3 Key: ${result.s3Key}`);
    console.log(`  S3 URL: ${result.s3Url.substring(0, 100)}...`);
    console.log(`  Dimensions: ${result.metadata.width}x${result.metadata.height}`);
    console.log(`  Format: ${result.metadata.format}`);
    console.log(`  Size: ${(result.metadata.size / 1024).toFixed(2)}KB`);
    console.log(`  Duration: ${result.metadata.duration}ms`);
    console.log('\n✅ Phase 3 - Compositing Pipeline: VERIFIED\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ TEST FAILED');
    console.error(error);
    process.exit(1);
  }
}

testCompositing();
