/**
 * Freepik Mystic API Test Script
 *
 * Tests the Freepik Mystic API to understand:
 * 1. Response format (sync vs async)
 * 2. Polling endpoints (if async)
 * 3. Status values
 * 4. Timing characteristics
 *
 * Run: node test-freepik-mystic.js
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const API_KEY = process.env.FREEPIK_API_KEY;
const API_URL = 'https://api.freepik.com/v1/ai/mystic';

console.log('\n🧪 Freepik Mystic API Test\n');
console.log('='.repeat(60));

if (!API_KEY) {
  console.error('❌ ERROR: FREEPIK_API_KEY not found in environment');
  console.error('Please set FREEPIK_API_KEY in your .env file');
  process.exit(1);
}

console.log(`✅ API Key found: ${API_KEY.substring(0, 8)}...`);
console.log(`📡 API URL: ${API_URL}`);
console.log('='.repeat(60));

/**
 * Test: Submit a simple generation request
 */
async function testGeneration() {
  console.log('\n📤 Step 1: Submitting generation request...\n');

  const payload = {
    prompt: 'Professional product photography background, clean modern aesthetic, soft gradient, studio lighting',
    resolution: '2k',
    aspect_ratio: 'square_1_1',
    model: 'realism'
  };

  console.log('Request payload:');
  console.log(JSON.stringify(payload, null, 2));
  console.log('');

  try {
    const startTime = Date.now();

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-freepik-api-key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const duration = Date.now() - startTime;

    console.log(`Response status: ${response.status} ${response.statusText}`);
    console.log(`Response time: ${duration}ms`);
    console.log('');

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error Response:');
      console.error(errorText);
      return null;
    }

    const result = await response.json();

    console.log('✅ API Response:');
    console.log(JSON.stringify(result, null, 2));
    console.log('');

    // Analyze response
    console.log('📊 Response Analysis:');
    console.log('='.repeat(60));

    // Handle nested data structure
    const data = result.data || result;

    if (data.task_id || result.task_id || data.id || result.id) {
      const taskId = data.task_id || result.task_id || data.id || result.id;
      const status = data.status || result.status || 'unknown';
      console.log(`✓ Task ID found: ${taskId}`);
      console.log(`✓ Status: ${status}`);
      console.log(`✓ Pattern: ASYNC (requires polling)`);

      // Check if URL is in generated array or direct field
      let url = null;
      if (data.generated && Array.isArray(data.generated) && data.generated.length > 0) {
        url = data.generated[0].url || data.generated[0];
      } else if (data.url || result.url) {
        url = data.url || result.url;
      }

      if (url) {
        console.log(`✓ URL provided immediately: ${url.substring(0, 50)}...`);
        console.log(`✓ Pattern: HYBRID (URL + task ID)`);
      } else {
        console.log(`✓ No URL in initial response (generated: ${data.generated?.length || 0} items)`);
        console.log(`✓ Pattern: PURE ASYNC (must poll for completion)`);
      }

      return { taskId, initialResponse: result };
    } else if (result.url) {
      console.log(`✓ URL provided immediately: ${result.url.substring(0, 50)}...`);
      console.log(`✓ Pattern: SYNCHRONOUS`);
      return { url: result.url, initialResponse: result };
    } else {
      console.log('⚠️  Unexpected response format');
      console.log('Please analyze the response structure above');
      return { initialResponse: result };
    }

  } catch (error) {
    console.error('❌ Test failed with error:');
    console.error(error.message);
    console.error(error.stack);
    return null;
  }
}

/**
 * Test: Poll for task completion (if async)
 */
async function testPolling(taskId) {
  console.log('\n📥 Step 2: Polling for completion...\n');
  console.log(`Task ID: ${taskId}`);
  console.log('');

  const pollUrl = `${API_URL}/${taskId}`;
  const maxAttempts = 30;
  const pollInterval = 3000; // 3 seconds

  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;

    console.log(`Poll attempt ${attempts}/${maxAttempts} (${pollUrl})`);

    try {
      const response = await fetch(pollUrl, {
        method: 'GET',
        headers: {
          'x-freepik-api-key': API_KEY
        }
      });

      if (!response.ok) {
        console.error(`  ❌ Poll failed: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.error(`  Error: ${errorText}`);
        break;
      }

      const result = await response.json();

      // Debug: log full response on first poll
      if (attempts === 1) {
        console.log('  Full poll response:', JSON.stringify(result, null, 2));
      }

      // Handle nested data structure
      const data = result.data || result;
      const status = data.status || result.status || 'unknown';

      console.log(`  Status: ${status}`);
      if (result.progress !== undefined) {
        console.log(`  Progress: ${result.progress}%`);
      }

      // Check for completion
      const statusUpper = status.toUpperCase();

      if (statusUpper === 'COMPLETED' || statusUpper === 'DONE' || statusUpper === 'SUCCESS' || statusUpper === 'FINISHED') {
        console.log('\n✅ Generation completed!');
        console.log('Final response:');
        console.log(JSON.stringify(result, null, 2));

        // Extract URL from generated array or direct field
        let imageUrl = null;
        if (data.generated && Array.isArray(data.generated) && data.generated.length > 0) {
          imageUrl = data.generated[0].url || data.generated[0];
        } else if (data.url || result.url) {
          imageUrl = data.url || result.url;
        }

        if (imageUrl) {
          console.log(`\n✓ Image URL: ${imageUrl}`);
          console.log(`✓ Total attempts: ${attempts}`);
          console.log(`✓ Total time: ~${attempts * (pollInterval / 1000)} seconds`);
        } else {
          console.log('\n⚠️  Generation completed but no URL found in response');
        }

        return result;
      }

      if (statusUpper === 'FAILED' || statusUpper === 'ERROR') {
        console.error('\n❌ Generation failed');
        console.error('Error details:');
        console.error(JSON.stringify(result, null, 2));
        return null;
      }

      // Wait before next poll
      if (attempts < maxAttempts) {
        console.log(`  ⏳ Waiting ${pollInterval / 1000}s before next poll...\n`);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }

    } catch (error) {
      console.error(`  ❌ Poll error: ${error.message}`);
      break;
    }
  }

  console.error(`\n❌ Max polling attempts (${maxAttempts}) reached`);
  return null;
}

/**
 * Main test flow
 */
async function main() {
  try {
    // Step 1: Submit generation request
    const submissionResult = await testGeneration();

    if (!submissionResult) {
      console.error('\n❌ Test failed at submission step');
      process.exit(1);
    }

    // Step 2: If async, poll for completion
    if (submissionResult.taskId && !submissionResult.url) {
      console.log('\n🔄 Async pattern detected, will poll for completion...');
      const pollResult = await testPolling(submissionResult.taskId);

      if (!pollResult) {
        console.error('\n❌ Test failed at polling step');
        process.exit(1);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Test completed successfully!');
    console.log('='.repeat(60));
    console.log('\n📝 Summary of findings:');
    console.log('   - Review the response formats above');
    console.log('   - Note the status values used');
    console.log('   - Document the polling pattern (if async)');
    console.log('   - Update FreepikBackgroundProvider accordingly');
    console.log('');

  } catch (error) {
    console.error('\n❌ Unexpected error in main flow:');
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run test
main();
