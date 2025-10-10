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

// Seed demo items if empty
const count = db.prepare('SELECT COUNT(*) AS c FROM items').get().c;
if (count === 0) {
  const ins = db.prepare('INSERT INTO items (id, sku, name) VALUES (?, ?, ?)');
  ins.run('item-1', 'VWS200433868', 'Kokorodama World Malt Whiskey');
  ins.run('item-2', 'SKU-002', 'Demo Bottled Gin');
}

export default db;
