/**
 * Background Worker Process
 *
 * Standalone process that runs the job processor.
 * Can be run separately from the web server for scalability.
 *
 * Usage:
 *   node worker.js
 */

import dotenv from 'dotenv';
import { startProcessor, stopProcessor, getProcessorStatus } from './workflows/processor.js';
import { runMigrations } from './db.js';

dotenv.config();

console.log('========================================');
console.log('Background Worker Starting');
console.log('========================================');
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`Database: ${process.env.DB_PATH || './data/database.db'}`);
console.log(`AI Provider: ${process.env.AI_PROVIDER || 'freepik'}`);
console.log('========================================\n');

// Run migrations first
console.log('[Worker] Running database migrations...');
runMigrations();
console.log('[Worker] Migrations complete\n');

// Start processor
startProcessor();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Worker] Received SIGINT, shutting down gracefully...');
  stopProcessor();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Worker] Received SIGTERM, shutting down gracefully...');
  stopProcessor();
  process.exit(0);
});

// Status logging every 30 seconds
setInterval(() => {
  const status = getProcessorStatus();
  if (status.currentJobs.length > 0) {
    console.log('[Worker] Status:', {
      running: status.isRunning,
      activeJobs: status.currentJobs.length,
      jobIds: status.currentJobs
    });
  }
}, 30000);

console.log('[Worker] Background worker is running. Press Ctrl+C to stop.\n');
