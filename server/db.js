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

// Seed demo items if empty
const count = db.prepare('SELECT COUNT(*) AS c FROM items').get().c;
if (count === 0) {
  const ins = db.prepare('INSERT INTO items (id, sku, name) VALUES (?, ?, ?)');
  ins.run('item-1', 'VWS200433868', 'Kokorodama World Malt Whiskey');
  ins.run('item-2', 'SKU-002', 'Demo Bottled Gin');
}

export default db;
