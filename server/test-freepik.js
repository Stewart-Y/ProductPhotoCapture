/**
 * Test Freepik Provider Integration
 *
 * This script tests the Freepik API with a real image to verify:
 * 1. Background removal works
 * 2. Images are downloaded and uploaded to S3
 * 3. Presigned URLs are generated
 * 4. Cost tracking works
 */

import dotenv from 'dotenv';
import { getSegmentProvider } from './providers/index.js';

dotenv.config();

// Test image URL - using a reliable test image
// This is a sample product photo from a public CDN
const TEST_IMAGE_URL = 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800';
const TEST_SKU = 'TEST-001';
const TEST_SHA256 = 'test-abc123def456';

async function testSegmentation() {
  console.log('========================================');
  console.log('Testing Freepik Background Removal');
  console.log('========================================\n');

  try {
    // Get provider instance
    const provider = getSegmentProvider();
    console.log(`✓ Provider initialized: ${provider.name}\n`);

    // Test background removal
    console.log('Calling removeBackground()...');
    console.log(`  Image URL: ${TEST_IMAGE_URL}`);
    console.log(`  SKU: ${TEST_SKU}`);
    console.log(`  SHA256: ${TEST_SHA256}\n`);

    const startTime = Date.now();

    const result = await provider.removeBackground({
      imageUrl: TEST_IMAGE_URL,
      sku: TEST_SKU,
      sha256: TEST_SHA256
    });

    const duration = Date.now() - startTime;

    console.log('\n========================================');
    console.log('Result:');
    console.log('========================================');
    console.log(JSON.stringify(result, null, 2));
    console.log(`\nTotal duration: ${duration}ms`);

    if (result.success) {
      console.log('\n✅ SUCCESS!');
      console.log(`   S3 Key: ${result.s3Key}`);
      console.log(`   S3 URL: ${result.s3Url.substring(0, 100)}...`);
      console.log(`   Cost: $${result.cost.toFixed(4)}`);
      console.log(`   Provider: ${result.provider}`);
    } else {
      console.log('\n❌ FAILED!');
      console.log(`   Error: ${result.error}`);
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ TEST FAILED WITH EXCEPTION:');
    console.error(error);
    process.exit(1);
  }
}

// Run test
testSegmentation().then(() => {
  console.log('\n========================================');
  console.log('Test complete!');
  console.log('========================================\n');
  process.exit(0);
});
