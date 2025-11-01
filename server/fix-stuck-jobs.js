/**
 * Fix stuck jobs that have composites but are still in QUEUED status
 */

import dotenv from 'dotenv';
import db from './db.js';

dotenv.config();

console.log('Fixing stuck jobs...\n');

const result = db.prepare(`
  UPDATE jobs
  SET status = 'DONE',
      completed_at = datetime('now'),
      updated_at = datetime('now')
  WHERE status = 'QUEUED'
    AND s3_composite_keys IS NOT NULL
`).run();

console.log(`Fixed ${result.changes} stuck job(s)`);
console.log('Jobs with composites are now marked as DONE\n');
