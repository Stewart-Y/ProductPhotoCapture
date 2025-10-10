import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Health
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Inventory routes (Phase 1)
app.get('/api/items', (_req, res) => {
  const rows = db.prepare('SELECT id, sku, name FROM items ORDER BY name ASC').all();
  res.json(rows);
});

app.get('/api/items/:id', (req, res) => {
  const item = db.prepare('SELECT id, sku, name FROM items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

// Photos placeholder (Phase 1: read only)
app.get('/api/items/:id/photos', (req, res) => {
  const photos = db.prepare('SELECT id, item_id, url, file_name, created_at FROM photos WHERE item_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json(photos);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
