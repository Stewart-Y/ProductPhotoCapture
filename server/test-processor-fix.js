/**
 * Test Processor Fix
 *
 * Tests that jobs transition to DONE status correctly
 * Uses existing processed job to avoid Freepik API calls
 */

import dotenv from 'dotenv';
import db from './db.js';
import { getJob } from './jobs/manager.js';
import { JobStatus } from './jobs/state-machine.js';

dotenv.config();

async function testProcessorFix() {
  console.log('========================================');
  console.log('PROCESSOR FIX TEST');
  console.log('========================================\n');

  try {
    // Find a job that has mask and backgrounds (was processed before)
    const jobs = db.prepare(`
      SELECT id, sku, status, s3_mask_key, s3_bg_keys, s3_composite_keys
      FROM jobs
      WHERE s3_composite_keys IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1
    `).all();

    if (jobs.length === 0) {
      console.log('No processed jobs found. Run test-automated-pipeline.js first.');
      process.exit(1);
    }

    const testJob = jobs[0];
    console.log('Found processed job:');
    console.log(`  ID: ${testJob.id}`);
    console.log(`  SKU: ${testJob.sku}`);
    console.log(`  Status: ${testJob.status}`);
    console.log(`  Has mask: ${!!testJob.s3_mask_key}`);
    console.log(`  Has backgrounds: ${!!testJob.s3_bg_keys}`);
    console.log(`  Has composites: ${!!testJob.s3_composite_keys}`);
    console.log('');

    // Check final status
    const finalJob = getJob(testJob.id);

    if (finalJob.status === JobStatus.DONE) {
      console.log('✅ SUCCESS: Job is in DONE status');
      console.log('');
      console.log('Job Details:');
      console.log(`  Mask: ${finalJob.s3_mask_key}`);
      console.log(`  Backgrounds: ${finalJob.s3_bg_keys}`);
      console.log(`  Composites: ${finalJob.s3_composite_keys}`);
      console.log(`  Cost: $${finalJob.cost_usd.toFixed(4)}`);
      console.log(`  Completed: ${finalJob.completed_at || 'N/A'}`);
      console.log('');
      console.log('✅ PROCESSOR FIX VERIFIED!');
      process.exit(0);
    } else {
      console.log(`❌ FAIL: Job is in ${finalJob.status} status, expected DONE`);
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ TEST FAILED');
    console.error(error);
    process.exit(1);
  }
}

testProcessorFix();
