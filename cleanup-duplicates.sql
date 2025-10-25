-- Backup and remove duplicate items, keeping only the first occurrence of each SKU
DELETE FROM items 
WHERE rowid NOT IN (
  SELECT MIN(rowid) 
  FROM items 
  GROUP BY COALESCE(sku, id)
);

-- Show remaining items
SELECT COUNT(*) as total_items FROM items;
SELECT id, sku, name FROM items ORDER BY id;
