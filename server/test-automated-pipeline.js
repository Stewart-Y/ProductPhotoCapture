/**
 * Test Automated Pipeline
 *
 * Tests the complete automated workflow:
 * 1. Create job via webhook
 * 2. Worker automatically processes: QUEUED → SEGMENTING → BG_GENERATING → COMPOSITING → DONE
 * 3. Verify final result
 */

import dotenv from 'dotenv';
import { createJob, getJob, updateJobStatus } from './jobs/manager.js';
import { JobStatus } from './jobs/state-machine.js';
import { startProcessor, stopProcessor } from './workflows/processor.js';

dotenv.config();

const TEST_IMAGE_URL = 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800';
const TEST_SKU = 'TEST-AUTO-001';
const TEST_SHA256 = 'auto-test-hash-456';

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testAutomatedPipeline() {
  console.log('========================================');
  console.log('AUTOMATED PIPELINE TEST');
  console.log('========================================\n');

  try {
    // Step 1: Create a job
    console.log('STEP 1: Creating job via webhook simulation');
    console.log('------------------------------------------');

    const job = createJob({
      sku: TEST_SKU,
      imageUrl: TEST_IMAGE_URL,
      sha256: TEST_SHA256,
      theme: 'default'
    });

    console.log(`✓ Job created: ${job.id}`);
    console.log(`  Status: ${job.status}`);
    console.log(`  SKU: ${job.sku}\n`);

    // Step 2: Transition to QUEUED to trigger worker
    console.log('STEP 2: Queueing job for processing');
    console.log('------------------------------------------');

    updateJobStatus(job.id, JobStatus.QUEUED);
    console.log(`✓ Job status: QUEUED\n`);

    // Step 3: Start worker
    console.log('STEP 3: Starting background worker');
    console.log('------------------------------------------');

    startProcessor();
    console.log('✓ Worker started\n');

    // Step 4: Monitor job progress
    console.log('STEP 4: Monitoring job progress (max 120 seconds)');
    console.log('------------------------------------------\n');

    const startTime = Date.now();
    const maxWait = 120000; // 2 minutes
    let lastStatus = null;

    while (true) {
      const currentJob = getJob(job.id);

      if (currentJob.status !== lastStatus) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[${elapsed}s] Status: ${currentJob.status}`);
        lastStatus = currentJob.status;
      }

      // Check if job is complete
      if (currentJob.status === JobStatus.DONE) {
        console.log('\n✅ JOB COMPLETED SUCCESSFULLY!');
        console.log('========================================');
        console.log('Final Result:');
        console.log(`  Job ID: ${currentJob.id}`);
        console.log(`  SKU: ${currentJob.sku}`);
        console.log(`  Status: ${currentJob.status}`);
        console.log(`  Mask: ${currentJob.s3_mask_key || 'N/A'}`);
        console.log(`  Background: ${currentJob.s3_bg_keys ? JSON.parse(currentJob.s3_bg_keys)[0] : 'N/A'}`);
        console.log(`  Composite: ${currentJob.s3_composite_keys ? JSON.parse(currentJob.s3_composite_keys)[0] : 'N/A'}`);
        console.log(`  Total Cost: $${currentJob.cost_usd.toFixed(4)}`);
        console.log(`  Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
        break;
      }

      if (currentJob.status === JobStatus.FAILED) {
        console.log('\n❌ JOB FAILED');
        console.log('========================================');
        console.log(`  Error Code: ${currentJob.error_code}`);
        console.log(`  Error Message: ${currentJob.error_message}`);
        stopProcessor();
        process.exit(1);
      }

      // Timeout check
      if (Date.now() - startTime > maxWait) {
        console.log('\n❌ TIMEOUT');
        console.log(`Job stuck in status: ${currentJob.status}`);
        stopProcessor();
        process.exit(1);
      }

      // Wait before next check
      await wait(2000); // Check every 2 seconds
    }

    // Stop worker
    console.log('\n========================================');
    console.log('Stopping worker...');
    stopProcessor();
    console.log('✅ AUTOMATED PIPELINE TEST PASSED!\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ TEST FAILED');
    console.error(error);
    stopProcessor();
    process.exit(1);
  }
}

// Run test
testAutomatedPipeline();
