import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';
import { nanoid } from 'nanoid';
import db from './db.js';
import tjmsClient from './tjms-client.js';
import jobRoutes from './jobs/routes.js';
import { captureRawBody } from './jobs/webhook-verify.js';

dotenv.config();

const app = express();
app.use(cors());

// Capture raw body for webhook verification (BEFORE express.json())
app.use(captureRawBody);

app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(__dirname, 'uploads');
const thumbDir = path.join(__dirname, 'uploads', 'thumbnails');
const tempDir = path.join(__dirname, 'uploads', 'tmp');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(thumbDir)) {
  fs.mkdirSync(thumbDir, { recursive: true });
}
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

app.use('/uploads', express.static(uploadDir));

const upload = multer({ 
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Health
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Job Queue Routes (Phase 1 - AI Background Generation Pipeline)
app.use('/api', jobRoutes);

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
    
    const photoId = nanoid();
    const processedFilename = `${photoId}.jpg`;
    const thumbFilename = `${photoId}_thumb.jpg`;
    const outputPath = path.join(uploadDir, processedFilename);
    const thumbPath = path.join(thumbDir, thumbFilename);

    // Import sharp dynamically
    const sharp = (await import('sharp')).default;
    
    // Read and auto-orient the image
    const image = sharp(req.file.path).rotate();
    
    // Generate full-size image (max 2048px)
    await image
      .clone()
      .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
      .toFile(outputPath);
    
    // Generate thumbnail (300x300, cropped to fill)
    await image
      .clone()
      .resize(300, 300, { fit: 'cover' })
      .jpeg({ quality: 85 })
      .toFile(thumbPath);

    // Delete the original temp file
    try {
      fs.unlinkSync(req.file.path);
    } catch (err) {
      console.error('Error deleting temp file:', err);
    }
    
    const imageUrl = `/uploads/${processedFilename}`;
    const thumbUrl = `/uploads/thumbnails/${thumbFilename}`;
    const now = new Date().toISOString();
    
    // Get the max position for this item and add 1
    const maxPos = db.prepare('SELECT MAX(position) as max FROM photos WHERE item_id = ?').get(id);
    const position = (maxPos.max ?? -1) + 1;

    // Insert into photos table
    db.prepare(`
      INSERT INTO photos (id, item_id, url, file_name, created_at, position)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(photoId, id, imageUrl, processedFilename, now, position);
    
    // Update item with image URL (set as main image)
    const stmt = db.prepare('UPDATE items SET image_url = ? WHERE id = ?');
    stmt.run(imageUrl, id);
    
    const updated = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    res.json(updated);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload image', details: error.message });
  }
});

// Set existing photo as main image (no duplicate creation)
app.put('/api/items/:id/set-main-image', express.json(), (req, res) => {
  try {
    const { id } = req.params;
    const { photoUrl } = req.body;
    
    if (!photoUrl) {
      return res.status(400).json({ error: 'photoUrl required' });
    }
    
    // Update item with the existing photo URL
    const stmt = db.prepare('UPDATE items SET image_url = ? WHERE id = ?');
    stmt.run(photoUrl, id);
    
    const updated = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    if (!updated) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json(updated);
  } catch (error) {
    console.error('Set main image error:', error);
    res.status(500).json({ error: 'Failed to set main image', details: error.message });
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
    
    // Generate full-size image (max 2048px for higher quality)
    await image
      .clone()
      .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
      .toFile(outputPath);
    
    // Generate thumbnail (300x300, cropped to fill, higher quality)
    await image
      .clone()
      .resize(300, 300, { fit: 'cover' })
      .jpeg({ quality: 85 })
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
    const { id: itemId, photoId } = req.params;
    const row = db.prepare('SELECT file_name FROM photos WHERE id = ?').get(photoId);
    if (!row) return res.status(404).json({ error: 'not found' });
    
    // Check if this is the last photo for the item
    const photoCount = db.prepare('SELECT COUNT(*) as count FROM photos WHERE item_id = ?').get(itemId);
    if (photoCount.count <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last photo. Items must have at least one photo.' });
    }
    
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

// 3JMS Integration endpoints
app.get('/api/tjms/sync-status', (_req, res) => {
  const stats = db.prepare('SELECT COUNT(*) as count FROM items').get();
  res.json({ 
    localItems: stats.count,
    lastSync: null // TODO: store last sync timestamp
  });
});

app.post('/api/tjms/import', async (req, res) => {
  // Return immediately and run import in background
  res.json({
    success: true,
    message: 'Import started in background',
    note: 'This may take several minutes for large inventories'
  });

  // Run import asynchronously
  (async () => {
    try {
      console.log('[3JMS Import] Starting background import (max 100 pages)...');
      
      let imported = 0;
      let updated = 0;
      let skipped = 0;
      let page = 1;
      const maxPages = 100;
      let hasMore = true;

      // Process items page by page instead of loading all into memory
      while (hasMore && page <= maxPages) {
        try {
          console.log(`[3JMS Import] Processing page ${page}/${maxPages}...`);
          const response = await tjmsClient.getAllInventorySKUs(page, 100);
          
          if (!response.results || response.results.length === 0) {
            console.log(`[3JMS Import] No results on page ${page}, stopping.`);
            hasMore = false;
            break;
          }

          console.log(`[3JMS Import] Got ${response.results.length} items on page ${page}`);

          // Process each item in this page
          for (const tjmsItem of response.results) {
      try {
        // Use 3JMS ID as string for consistency
        const tjmsId = String(tjmsItem.item_id || tjmsItem.vws_product_sku);
        const tjmsSku = tjmsItem.vws_product_sku || tjmsItem.item_id || '';
        
        // Map 3JMS fields to our schema
        const itemData = {
          id: tjmsId,
          sku: tjmsSku,
          name: tjmsItem.name || tjmsItem.full_display_name || 'Unknown Item',
          brand: tjmsItem.brand || null,
          year: tjmsItem.year || tjmsItem.vintage || null,
          category: tjmsItem.category || null,
          size: tjmsItem.bottle_size || tjmsItem.size || null,
          subcategory: tjmsItem.subcategory || null,
          abv: tjmsItem.abv ? String(tjmsItem.abv) : null,
          weight: tjmsItem.weight ? String(tjmsItem.weight) : null,
          case_size: tjmsItem.case_size || tjmsItem.pack_size || null,
          par_level: tjmsItem.par_level || tjmsItem.stock || null,
          description: tjmsItem.description || null,
          upc: tjmsItem.upc || null,
          // Preserve existing image_url and photo data
          image_url: null, // Don't overwrite existing photos
          requires_extra_scan: 0,
          ignore_from_sales: 0,
          discontinued: tjmsItem.discontinued || tjmsItem.inactive ? 1 : 0,
          warehouse_shelf: tjmsItem.location || tjmsItem.shelf || null,
          warehouse_row: tjmsItem.row || null,
          warehouse_column: tjmsItem.column || tjmsItem.bin || null
        };

        // Check if item exists by ID or SKU
        let existing = db.prepare('SELECT id, image_url, sku FROM items WHERE id = ?').get(itemData.id);
        
        // If not found by ID, try by SKU
        if (!existing && itemData.sku) {
          existing = db.prepare('SELECT id, image_url, sku FROM items WHERE sku = ?').get(itemData.sku);
        }
        
        console.log(`[3JMS Import] Item ${tjmsId}: ${existing ? 'UPDATING' : 'INSERTING'} - SKU: ${tjmsSku}`);
        
        if (existing) {
          // Update existing item but preserve image_url
          itemData.image_url = existing.image_url;
          db.prepare(`
            UPDATE items SET
              name = ?, sku = ?, brand = ?, year = ?, category = ?,
              size = ?, subcategory = ?, abv = ?, weight = ?, case_size = ?,
              par_level = ?, description = ?, upc = ?, discontinued = ?,
              warehouse_shelf = ?, warehouse_row = ?, warehouse_column = ?
            WHERE id = ?
          `).run(
            itemData.name, itemData.sku, itemData.brand, itemData.year, itemData.category,
            itemData.size, itemData.subcategory, itemData.abv, itemData.weight, itemData.case_size,
            itemData.par_level, itemData.description, itemData.upc, itemData.discontinued,
            itemData.warehouse_shelf, itemData.warehouse_row, itemData.warehouse_column,
            existing.id
          );
          updated++;
        } else {
          // Insert new item
          db.prepare(`
            INSERT INTO items (id, sku, name, brand, year, category, size, subcategory, abv, weight, case_size, par_level, description, upc, discontinued, warehouse_shelf, warehouse_row, warehouse_column)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            itemData.id, itemData.sku, itemData.name, itemData.brand, itemData.year,
            itemData.category, itemData.size, itemData.subcategory, itemData.abv, itemData.weight,
            itemData.case_size, itemData.par_level, itemData.description, itemData.upc,
            itemData.discontinued, itemData.warehouse_shelf, itemData.warehouse_row, itemData.warehouse_column
          );
          imported++;
        }
      } catch (itemError) {
        console.error(`[3JMS Import] Failed to import item ${tjmsItem.id}:`, itemError);
        skipped++;
      }
    }

          console.log(`[3JMS Import] Page ${page} complete. Total so far: ${imported} imported, ${updated} updated, ${skipped} skipped`);
          
          // Move to next page
          page++;
          hasMore = response.next !== null;
          
          // Rate limit: 40 requests/minute = ~1.5 seconds between requests
          if (hasMore && page <= maxPages) {
            await new Promise(resolve => setTimeout(resolve, 1600));
          }
        } catch (pageError) {
          console.error(`[3JMS Import] Error processing page ${page}:`, pageError);
          hasMore = false;
        }
      }

      console.log(`[3JMS Import] Complete: ${imported} imported, ${updated} updated, ${skipped} skipped over ${page - 1} pages`);
    } catch (error) {
      console.error('[3JMS Import] Background error:', error);
    }
  })();
});

// Test 3JMS API permissions
app.get('/api/tjms/test-permissions', async (req, res) => {
  try {
    console.log('[3JMS] Testing API permissions...');
    
    // Try to fetch inventory (read permission)
    const inventoryTest = await tjmsClient.getInventory(1, 1);
    const canRead = !!inventoryTest;
    
    let canWrite = false;
    let writeError = null;
    
    // Try to fetch one item to test update (we won't actually update, just test the endpoint)
    if (inventoryTest.results && inventoryTest.results.length > 0) {
      try {
        const testItem = inventoryTest.results[0];
        // We'll just test if we can fetch the item detail (safer than actually updating)
        const itemDetail = await tjmsClient.getItem(testItem.id);
        // If we can read item details, assume we can update (to test for real, we'd need to actually try updating)
        canWrite = !!itemDetail;
      } catch (err) {
        writeError = err.message;
      }
    }
    
    res.json({
      canRead,
      canWrite,
      writeError,
      note: 'Write permission tested by fetching item details. To confirm update capability, try the push endpoint with real data.'
    });
  } catch (error) {
    console.error('[3JMS] Permission test error:', error);
    res.status(500).json({ 
      error: 'Permission test failed', 
      details: error.message 
    });
  }
});

// Push local item changes to 3JMS
app.post('/api/tjms/push/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get local item
    const localItem = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    if (!localItem) {
      return res.status(404).json({ error: 'Item not found locally' });
    }
    
    // Map local item to 3JMS format
    const tjmsData = {
      name: localItem.name,
      sku: localItem.sku,
      brand: localItem.brand,
      vintage: localItem.year,
      category: localItem.category,
      size: localItem.size,
      subcategory: localItem.subcategory,
      abv: localItem.abv,
      weight: localItem.weight,
      case_size: localItem.case_size,
      par_level: localItem.par_level,
      description: localItem.description,
      upc: localItem.upc,
      discontinued: localItem.discontinued === 1
    };
    
    // Try to update in 3JMS
    const result = await tjmsClient.updateItem(localItem.id, tjmsData);
    
    res.json({
      success: true,
      message: 'Item updated in 3JMS',
      tjmsResponse: result
    });
  } catch (error) {
    console.error('[3JMS Push] Error:', error);
    res.status(500).json({ 
      error: 'Failed to push to 3JMS', 
      details: error.message,
      note: 'Your API token may not have write permissions, or the item may not exist in 3JMS'
    });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
