/**
 * End-to-End Test: Freepik Background Removal → Background Generation → Compositing
 *
 * This test runs the complete pipeline with real API calls
 */

import dotenv from 'dotenv';
import { getSegmentProvider, getBackgroundProvider } from './providers/index.js';
import { compositeImage } from './workflows/composite.js';

dotenv.config();

// Test image URL
const TEST_IMAGE_URL = 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800';
const TEST_SKU = 'TEST-E2E-001';
const TEST_SHA256 = 'e2e-test-hash-123';
const TEST_THEME = 'default';

async function runEndToEndTest() {
  console.log('========================================');
  console.log('END-TO-END PIPELINE TEST');
  console.log('========================================\n');

  const startTime = Date.now();
  let totalCost = 0;

  try {
    // ==========================================================================
    // STEP 1: Background Removal (Segmentation)
    // ==========================================================================
    console.log('STEP 1: Background Removal');
    console.log('------------------------------------------');

    const segmentProvider = getSegmentProvider();
    console.log(`Provider: ${segmentProvider.name}\n`);

    const segmentResult = await segmentProvider.removeBackground({
      imageUrl: TEST_IMAGE_URL,
      sku: TEST_SKU,
      sha256: TEST_SHA256
    });

    if (!segmentResult.success) {
      throw new Error(`Segmentation failed: ${segmentResult.error}`);
    }

    totalCost += segmentResult.cost;

    console.log('✅ Segmentation complete:');
    console.log(`   S3 Key: ${segmentResult.s3Key}`);
    console.log(`   Cost: $${segmentResult.cost.toFixed(4)}`);
    console.log(`   Duration: ${segmentResult.metadata.duration}ms\n`);

    // ==========================================================================
    // STEP 2: Background Generation
    // ==========================================================================
    console.log('STEP 2: Background Generation');
    console.log('------------------------------------------');

    const bgProvider = getBackgroundProvider();
    console.log(`Provider: ${bgProvider.name}`);
    console.log(`Theme: ${TEST_THEME}\n`);

    const bgResult = await bgProvider.generateBackground({
      theme: TEST_THEME,
      sku: TEST_SKU,
      sha256: TEST_SHA256,
      dimensions: {
        width: segmentResult.metadata.width || 1024,
        height: segmentResult.metadata.height || 1024
      }
    });

    if (!bgResult.success) {
      throw new Error(`Background generation failed: ${bgResult.error}`);
    }

    totalCost += bgResult.cost;

    console.log('✅ Background generation complete:');
    console.log(`   S3 Key: ${bgResult.s3Key}`);
    console.log(`   Cost: $${bgResult.cost.toFixed(4)}`);
    console.log(`   Duration: ${bgResult.metadata.duration}ms\n`);

    // ==========================================================================
    // STEP 3: Compositing
    // ==========================================================================
    console.log('STEP 3: Image Compositing');
    console.log('------------------------------------------');

    const compositeResult = await compositeImage({
      maskS3Key: segmentResult.s3Key,
      backgroundS3Key: bgResult.s3Key,
      sku: TEST_SKU,
      sha256: TEST_SHA256,
      theme: TEST_THEME,
      variant: 1,
      options: {
        quality: 90,
        format: 'jpeg'
      }
    });

    if (!compositeResult.success) {
      throw new Error(`Compositing failed: ${compositeResult.error}`);
    }

    console.log('✅ Compositing complete:');
    console.log(`   S3 Key: ${compositeResult.s3Key}`);
    console.log(`   Dimensions: ${compositeResult.metadata.width}x${compositeResult.metadata.height}`);
    console.log(`   Size: ${(compositeResult.metadata.size / 1024).toFixed(2)}KB`);
    console.log(`   Duration: ${compositeResult.metadata.duration}ms\n`);

    // ==========================================================================
    // SUMMARY
    // ==========================================================================
    const totalDuration = Date.now() - startTime;

    console.log('========================================');
    console.log('PIPELINE SUMMARY');
    console.log('========================================');
    console.log(`Total Duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`);
    console.log(`Total Cost: $${totalCost.toFixed(4)}`);
    console.log('\nS3 Keys Generated:');
    console.log(`  Mask:       ${segmentResult.s3Key}`);
    console.log(`  Background: ${bgResult.s3Key}`);
    console.log(`  Composite:  ${compositeResult.s3Key}`);
    console.log('\nPresigned URLs (valid for 1 hour):');
    console.log(`  Mask:       ${segmentResult.s3Url.substring(0, 100)}...`);
    console.log(`  Background: ${bgResult.s3Url.substring(0, 100)}...`);
    console.log(`  Composite:  ${compositeResult.s3Url.substring(0, 100)}...`);
    console.log('\n✅ END-TO-END TEST PASSED!\n');

    process.exit(0);

  } catch (error) {
    console.error('\n========================================');
    console.error('❌ END-TO-END TEST FAILED');
    console.error('========================================');
    console.error(error);
    console.error(`\nTotal cost before failure: $${totalCost.toFixed(4)}`);
    process.exit(1);
  }
}

// Run test
runEndToEndTest();
