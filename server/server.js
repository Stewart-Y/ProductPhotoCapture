import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';
import { nanoid } from 'nanoid';
import db from './db.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Serve uploaded files statically
app.use('/uploads', express.static(uploadDir));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${nanoid()}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|bmp|svg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed!'));
  }
});

// Health
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Inventory routes (Phase 1)
app.get('/api/items', (_req, res) => {
  const rows = db.prepare('SELECT * FROM items ORDER BY name ASC').all();
  res.json(rows);
});

app.get('/api/items/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

// Update item
app.put('/api/items/:id', (req, res) => {
  const { id } = req.params;
  const {
    name, sku, brand, year, category, size, subcategory, abv, weight,
    case_size, par_level, description, extra_field_1, extra_field_2, extra_field_3,
    upc, requires_extra_scan, ignore_from_sales, discontinued,
    warehouse_shelf, warehouse_row, warehouse_column
  } = req.body;

  try {
    const stmt = db.prepare(`
      UPDATE items SET
        name = ?,
        sku = ?,
        brand = ?,
        year = ?,
        category = ?,
        size = ?,
        subcategory = ?,
        abv = ?,
        weight = ?,
        case_size = ?,
        par_level = ?,
        description = ?,
        extra_field_1 = ?,
        extra_field_2 = ?,
        extra_field_3 = ?,
        upc = ?,
        requires_extra_scan = ?,
        ignore_from_sales = ?,
        discontinued = ?,
        warehouse_shelf = ?,
        warehouse_row = ?,
        warehouse_column = ?
      WHERE id = ?
    `);

    const result = stmt.run(
      name, sku, brand, year, category, size, subcategory, abv, weight,
      case_size, par_level, description, extra_field_1, extra_field_2, extra_field_3,
      upc, requires_extra_scan ? 1 : 0, ignore_from_sales ? 1 : 0, discontinued ? 1 : 0,
      warehouse_shelf, warehouse_row, warehouse_column, id
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const updated = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    res.json(updated);
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// Image upload endpoint
app.post('/api/items/:id/upload-image', upload.single('image'), (req, res) => {
  try {
    const { id } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const imageUrl = `/uploads/${req.file.filename}`;
    
    // Update item with image URL
    const stmt = db.prepare('UPDATE items SET image_url = ? WHERE id = ?');
    stmt.run(imageUrl, id);
    
    const updated = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    res.json(updated);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Photos routes
app.get('/api/items/:id/photos', (req, res) => {
  const photos = db.prepare('SELECT id, item_id, url, file_name, created_at FROM photos WHERE item_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json(photos);
});

// CREATE photo
app.post('/api/items/:id/photos', upload.single('file'), (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ error: 'file required' });

    const photoId = nanoid();
    const fileName = `${photoId}.jpg`; // normalize extension
    const filePath = path.join(uploadDir, fileName);
    
    // rename Multer temp file -> our filename
    fs.renameSync(req.file.path, filePath);

    // public URL (static /uploads is already served)
    const url = `/uploads/${fileName}`;
    const createdAt = new Date().toISOString();

    db.prepare(`
      INSERT INTO photos (id, item_id, url, file_name, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(photoId, id, url, fileName, createdAt);

    const row = db.prepare(`SELECT id, item_id, url, file_name, created_at FROM photos WHERE id = ?`).get(photoId);
    res.status(201).json(row);
  } catch (error) {
    console.error('Photo upload error:', error);
    res.status(500).json({ error: 'Failed to upload photo' });
  }
});

// DELETE photo
app.delete('/api/items/:id/photos/:photoId', (req, res) => {
  try {
    const { photoId } = req.params;
    const row = db.prepare('SELECT file_name FROM photos WHERE id = ?').get(photoId);
    if (!row) return res.status(404).json({ error: 'not found' });
    
    // Delete file from disk
    try { 
      fs.unlinkSync(path.join(uploadDir, row.file_name)); 
    } catch (err) {
      console.warn('Could not delete file:', err);
    }
    
    // Delete from database
    db.prepare('DELETE FROM photos WHERE id = ?').run(photoId);
    res.json({ ok: true });
  } catch (error) {
    console.error('Photo delete error:', error);
    res.status(500).json({ error: 'Failed to delete photo' });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
