import Database from 'better-sqlite3';

const db = new Database('./db.sqlite');

console.log('Before cleanup:');
const beforeCount = db.prepare('SELECT COUNT(*) as count FROM items').get();
console.log(`Total items: ${beforeCount.count}`);

// Show items with null SKUs
const nullSkus = db.prepare(`SELECT id, name FROM items WHERE sku IS NULL OR sku = ''`).all();
console.log(`\nItems with null/empty SKU: ${nullSkus.length}`);

// Delete all items with null or empty SKUs (these are broken imports)
console.log('\nRemoving items with null/empty SKUs...');
const result = db.prepare(`DELETE FROM items WHERE sku IS NULL OR sku = ''`).run();

console.log(`Deleted ${result.changes} broken items`);

console.log('\nAfter cleanup:');
const afterCount = db.prepare('SELECT COUNT(*) as count FROM items').get();
console.log(`Total items: ${afterCount.count}`);

const remaining = db.prepare('SELECT id, sku, name FROM items ORDER BY id').all();
console.log('\nRemaining items:');
remaining.forEach(item => {
  console.log(`  ${item.id} | ${item.sku || 'no-sku'} | ${item.name}`);
});

db.close();
