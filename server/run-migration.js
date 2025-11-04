/**
 * Run Database Migration
 * Executes the 005-background-templates.sql migration
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'db.sqlite');
const migrationPath = path.join(__dirname, 'migrations', '007-template-variant-selection.sql');

console.log('[Migration] Starting migration 007-template-variant-selection');
console.log('[Migration] Database path:', dbPath);
console.log('[Migration] Migration file:', migrationPath);

try {
  // Read migration SQL
  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Open database
  const db = new Database(dbPath);

  // Execute migration
  db.exec(sql);

  console.log('[Migration] ✅ Migration completed successfully');

  // Verify column was added
  const columns = db.prepare(`
    PRAGMA table_info(template_assets)
  `).all();

  console.log('[Migration] template_assets columns:', columns.map(c => c.name).join(', '));

  // Check migration version
  const version = db.prepare(`SELECT value FROM metadata WHERE key = 'migration_version'`).get();
  console.log('[Migration] Current migration version:', version?.value);

  db.close();

} catch (error) {
  console.error('[Migration] ❌ Migration failed:', error);
  process.exit(1);
}
