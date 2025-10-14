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

const uploadDir = path.join(__dirname, 'uploads');
const thumbDir = path.join(__dirname, 'uploads', 'thumbnails');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(thumbDir)) {
  fs.mkdirSync(thumbDir, { recursive: true });
}

app.use('/uploads', express.static(uploadDir));

const upload = multer({ 
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 }
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
app.put('/api/items/:id', express.json(), (req, res) => {
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

// Image upload endpoint (main item image)
app.post('/api/items/:id/upload-image', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const processedFilename = `item-${id}-${Date.now()}.jpg`;
    const outputPath = path.join(uploadDir, processedFilename);

    // Import sharp dynamically
    const sharp = (await import('sharp')).default;
    
    // Process image: auto-orient, resize to max 1024px, convert to JPEG
    await sharp(req.file.path)
      .rotate() // auto-orient based on EXIF
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(outputPath);

    // Delete the original temp file
    try {
      fs.unlinkSync(req.file.path);
    } catch (err) {
      console.error('Error deleting temp file:', err);
    }
    
    const imageUrl = `/uploads/${processedFilename}`;
    
    // Update item with image URL
    const stmt = db.prepare('UPDATE items SET image_url = ? WHERE id = ?');
    stmt.run(imageUrl, id);
    
    const updated = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    res.json(updated);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload image', details: error.message });
  }
});

// Photos routes
app.get('/api/items/:id/photos', (req, res) => {
  const rows = db.prepare('SELECT * FROM photos WHERE item_id = ? ORDER BY position ASC, created_at ASC').all(req.params.id);
  // Add thumb_url for each photo
  const photosWithThumbs = rows.map(photo => ({
    ...photo,
    thumb_url: `/uploads/thumbnails/${photo.file_name.replace('.jpg', '_thumb.jpg')}`
  }));
  res.json(photosWithThumbs);
});

app.post('/api/items/:id/photos', upload.single('file'), async (req, res) => {
  try {
    const { id: itemId } = req.params;
    if (!req.file) {
      return res.status(400).json({ error: 'file required' });
    }

    const photoId = nanoid();
    const processedFilename = `${photoId}.jpg`;
    const thumbFilename = `${photoId}_thumb.jpg`;
    const outputPath = path.join(uploadDir, processedFilename);
    const thumbPath = path.join(thumbDir, thumbFilename);

    // Import sharp dynamically
    const sharp = (await import('sharp')).default;
    
    // Read and auto-orient the image
    const image = sharp(req.file.path).rotate();
    
    // Generate full-size image (max 1024px)
    await image
      .clone()
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(outputPath);
    
    // Generate thumbnail (240x240, cropped to fill)
    await image
      .clone()
      .resize(240, 240, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toFile(thumbPath);

    // Delete the original temp file
    try {
      fs.unlinkSync(req.file.path);
    } catch (err) {
      console.error('Error deleting temp file:', err);
    }

    const url = `/uploads/${processedFilename}`;
    const thumbUrl = `/uploads/thumbnails/${thumbFilename}`;
    const now = new Date().toISOString();
    
    // Get the max position for this item and add 1
    const maxPos = db.prepare('SELECT MAX(position) as max FROM photos WHERE item_id = ?').get(itemId);
    const position = (maxPos.max ?? -1) + 1;

    db.prepare(`
      INSERT INTO photos (id, item_id, url, file_name, created_at, position)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(photoId, itemId, url, processedFilename, now, position);

    res.status(201).json({
      id: photoId,
      item_id: itemId,
      url,
      thumb_url: thumbUrl,
      file_name: processedFilename,
      created_at: now
    });
  } catch (e) {
    console.error('Upload error:', e);
    res.status(500).json({ error: 'upload failed', details: e.message });
  }
});

// DELETE photo
app.delete('/api/items/:id/photos/:photoId', (req, res) => {
  try {
    const { photoId } = req.params;
    const row = db.prepare('SELECT file_name FROM photos WHERE id = ?').get(photoId);
    if (!row) return res.status(404).json({ error: 'not found' });
    
    // Delete main photo
    const filePath = path.join(uploadDir, row.file_name);
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error('Error deleting file:', err);
    }
    
    // Delete thumbnail
    const thumbPath = path.join(thumbDir, row.file_name.replace('.jpg', '_thumb.jpg'));
    try {
      fs.unlinkSync(thumbPath);
    } catch (err) {
      console.error('Error deleting thumbnail:', err);
    }
    
    db.prepare('DELETE FROM photos WHERE id = ?').run(photoId);
    res.json({ ok: true });
  } catch (error) {
    console.error('Photo delete error:', error);
    res.status(500).json({ error: 'Failed to delete photo' });
  }
});

// Update photo positions (for reordering)
app.put('/api/items/:id/photos/reorder', (req, res) => {
  try {
    const { id: itemId } = req.params;
    const { photoIds } = req.body; // Array of photo IDs in new order
    
    if (!Array.isArray(photoIds)) {
      return res.status(400).json({ error: 'photoIds must be an array' });
    }
    
    // Update position for each photo
    const updateStmt = db.prepare('UPDATE photos SET position = ? WHERE id = ? AND item_id = ?');
    const transaction = db.transaction((ids) => {
      ids.forEach((photoId, index) => {
        updateStmt.run(index, photoId, itemId);
      });
    });
    
    transaction(photoIds);
    
    res.json({ ok: true });
  } catch (error) {
    console.error('Reorder error:', error);
    res.status(500).json({ error: 'Failed to reorder photos' });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
