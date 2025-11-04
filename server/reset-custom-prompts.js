/**
 * Reset Custom Prompts Table
 * Drops and recreates the custom_prompts table with only the default prompt
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'db.sqlite');

console.log('[Reset] Resetting custom_prompts table');
console.log('[Reset] Database path:', dbPath);

try {
  const db = new Database(dbPath);

  // Drop existing table
  db.exec('DROP TABLE IF EXISTS custom_prompts;');
  console.log('[Reset] Dropped custom_prompts table');

  // Recreate table with only default prompt
  db.exec(`
    CREATE TABLE IF NOT EXISTS custom_prompts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL UNIQUE,
      prompt TEXT NOT NULL,
      is_default BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      used_count INTEGER DEFAULT 0
    );

    INSERT INTO custom_prompts (id, title, prompt, is_default, created_at)
    VALUES
      ('prompt_default', 'Custom Prompt', 'Professional product photography empty background scene, vacant center foreground space ready for placement, soft gradient backdrop fading from light to slightly darker tone, clean smooth surface in sharp focus. Studio lighting setup with key and fill lights illuminating empty foreground area, high quality commercial photography, photorealistic rendering, subtle texture, depth of field with blurred edges, background elements at periphery.', 1, datetime('now'));

    CREATE INDEX IF NOT EXISTS idx_custom_prompts_title ON custom_prompts(title);
    CREATE INDEX IF NOT EXISTS idx_custom_prompts_default ON custom_prompts(is_default);
  `);

  console.log('[Reset] ✅ custom_prompts table reset successfully');

  // Verify
  const prompts = db.prepare('SELECT * FROM custom_prompts').all();
  console.log('[Reset] Prompts in table:', prompts.length);
  prompts.forEach(p => console.log(`  - ${p.title} (default: ${p.is_default})`));

  db.close();

} catch (error) {
  console.error('[Reset] ❌ Reset failed:', error);
  process.exit(1);
}
