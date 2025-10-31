import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH || './db.sqlite';
const db = new Database(DB_PATH);

// Initialize schema
const schemaPath = path.join(__dirname, 'schema.sql');
const schemaSQL = fs.readFileSync(schemaPath, 'utf-8');
db.exec(schemaSQL);

// Migration: Add new columns if they don't exist
try {
  const columns = db.prepare('PRAGMA table_info(items)').all();
  const columnNames = columns.map(col => col.name);
  
  const newColumns = [
    'image_url TEXT',
    'brand TEXT',
    'year TEXT',
    'category TEXT',
    'size TEXT',
    'subcategory TEXT',
    'abv TEXT',
    'weight TEXT',
    'case_size TEXT',
    'par_level TEXT',
    'description TEXT',
    'extra_field_1 TEXT',
    'extra_field_2 TEXT',
    'extra_field_3 TEXT',
    'upc TEXT',
    'requires_extra_scan INTEGER DEFAULT 0',
    'ignore_from_sales INTEGER DEFAULT 0',
    'discontinued INTEGER DEFAULT 0',
    'warehouse_shelf TEXT',
    'warehouse_row TEXT',
    'warehouse_column TEXT'
  ];
  
  newColumns.forEach(colDef => {
    const colName = colDef.split(' ')[0];
    if (!columnNames.includes(colName)) {
      try {
        db.exec(`ALTER TABLE items ADD COLUMN ${colDef}`);
        console.log(`Added column: ${colName}`);
      } catch (e) {
        // Column might already exist, ignore
      }
    }
  });
} catch (err) {
  console.error('Migration error:', err);
}

// Migration: Add position column to photos table
try {
  const photosColumns = db.prepare('PRAGMA table_info(photos)').all();
  const photosColumnNames = photosColumns.map(col => col.name);

  if (!photosColumnNames.includes('position')) {
    db.exec('ALTER TABLE photos ADD COLUMN position INTEGER DEFAULT 0');
    console.log('Added position column to photos table');

    // Set initial positions based on created_at for existing photos
    const items = db.prepare('SELECT DISTINCT item_id FROM photos').all();
    items.forEach(({ item_id }) => {
      const photos = db.prepare('SELECT id FROM photos WHERE item_id = ? ORDER BY created_at ASC').all(item_id);
      photos.forEach((photo, index) => {
        db.prepare('UPDATE photos SET position = ? WHERE id = ?').run(index, photo.id);
      });
    });
    console.log('Initialized photo positions');
  }
} catch (err) {
  console.error('Photos migration error:', err);
}

// =============================================================================
// MIGRATION SYSTEM: Run numbered migration files
// =============================================================================
function runMigrations() {
  const migrationsDir = path.join(__dirname, 'migrations');

  // Create migrations directory if it doesn't exist
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
    console.log('[Migrations] Created migrations directory');
  }

  // Get all .sql migration files
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort(); // Natural sort ensures 001, 002, 003, etc.

  if (migrationFiles.length === 0) {
    console.log('[Migrations] No migration files found');
    return;
  }

  // Create metadata table if it doesn't exist (stores migration state)
  db.exec(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Get current migration version
  const currentVersionRow = db.prepare("SELECT value FROM metadata WHERE key = 'migration_version'").get();
  const currentVersion = currentVersionRow ? parseInt(currentVersionRow.value, 10) : 0;

  console.log(`[Migrations] Current version: ${currentVersion}`);

  // Run each migration file that hasn't been applied yet
  migrationFiles.forEach(file => {
    // Extract migration number from filename (e.g., "002-jobs-and-shopify.sql" -> 2)
    const match = file.match(/^(\d+)-/);
    if (!match) {
      console.warn(`[Migrations] Skipping file with invalid name: ${file}`);
      return;
    }

    const migrationNumber = parseInt(match[1], 10);

    if (migrationNumber <= currentVersion) {
      console.log(`[Migrations] Skipping already applied: ${file}`);
      return;
    }

    console.log(`[Migrations] Running migration: ${file}`);

    try {
      const migrationPath = path.join(migrationsDir, file);
      const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

      // Run migration in a transaction
      db.exec('BEGIN TRANSACTION');
      db.exec(migrationSQL);

      // Update migration version
      db.prepare(`
        INSERT OR REPLACE INTO metadata (key, value, updated_at)
        VALUES ('migration_version', ?, CURRENT_TIMESTAMP)
      `).run(migrationNumber.toString());

      db.exec('COMMIT');

      console.log(`[Migrations] ✅ Successfully applied: ${file}`);
    } catch (error) {
      db.exec('ROLLBACK');
      console.error(`[Migrations] ❌ Failed to apply ${file}:`, error.message);
      throw error; // Stop on first migration failure
    }
  });

  console.log('[Migrations] All migrations complete');
}

// Run migrations on startup
try {
  runMigrations();
} catch (err) {
  console.error('[Migrations] Critical error during migration:', err);
  process.exit(1);
}

// Seed demo items if empty
const count = db.prepare('SELECT COUNT(*) AS c FROM items').get().c;
if (count === 0) {
  const ins = db.prepare('INSERT INTO items (id, sku, name) VALUES (?, ?, ?)');
  ins.run('item-1', 'VWS200433868', 'Kokorodama World Malt Whiskey');
  ins.run('item-2', 'SKU-002', 'Demo Bottled Gin');
}

export default db;
