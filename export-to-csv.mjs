import fs from 'fs';

const TJMS_BASE_URL = 'https://3jms.vistawinespirits.com';
const TJMS_API_TOKEN = 'f289f50fac528195af803f2932835c1992b305b0';

/**
 * Fetch all inventory from 3JMS API
 */
async function fetchAll3JMSInventory() {
  const allItems = [];
  let page = 1;
  let hasMore = true;

  console.log('Starting 3JMS inventory export...\n');

  while (hasMore) {
    try {
      const url = `${TJMS_BASE_URL}/api/v1/inventory/sku/all/?page=${page}`;
      console.log(`Fetching page ${page}...`);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Token ${TJMS_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        allItems.push(...data.results);
        console.log(`  ✓ Got ${data.results.length} items (Total: ${allItems.length})`);
        page++;
        hasMore = data.next !== null;
      } else {
        hasMore = false;
      }

      // Rate limit: ~1.5 seconds between requests
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 1600));
      }
    } catch (error) {
      console.log(`Stopped at page ${page}: ${error.message}`);
      hasMore = false;
    }
  }

  console.log(`\n✓ Total items fetched: ${allItems.length}\n`);
  return allItems;
}

/**
 * Escape CSV field (handle commas, quotes, newlines)
 */
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert items to CSV format (excluding location data)
 */
function convertToCSV(items) {
  // Define CSV headers (excluding location-related fields)
  const headers = [
    'ID',
    'Brand',
    'Name',
    'Size',
    'Category',
    'Subcategory',
    'ABV',
    'Weight',
    'Par Level',
    'Case Size',
    'Description',
    'Extra Field 1',
    'Extra Field 2',
    'Extra Field 3',
    'Image URL',
    'Thumbnail URL',
    'Created At',
    'Updated At'
  ];

  // Create CSV header row
  let csv = headers.join(',') + '\n';

  // Add data rows
  items.forEach(item => {
    const row = [
      escapeCSV(item.id || item.sku),
      escapeCSV(item.brand),
      escapeCSV(item.name),
      escapeCSV(item.size),
      escapeCSV(item.category),
      escapeCSV(item.subcategory),
      escapeCSV(item.abv),
      escapeCSV(item.weight),
      escapeCSV(item.par_level || item.parLevel),
      escapeCSV(item.case_size || item.caseSize),
      escapeCSV(item.description),
      escapeCSV(item.extra_field_1 || item.extraField1),
      escapeCSV(item.extra_field_2 || item.extraField2),
      escapeCSV(item.extra_field_3 || item.extraField3),
      escapeCSV(item.image_url || item.imageUrl || ''),
      escapeCSV(item.thumbnail_url || item.thumbnailUrl || ''),
      escapeCSV(item.created_at || item.createdAt || ''),
      escapeCSV(item.updated_at || item.updatedAt || '')
    ];
    csv += row.join(',') + '\n';
  });

  return csv;
}

/**
 * Main export function
 */
async function exportToCSV() {
  try {
    // Fetch all items from 3JMS
    const items = await fetchAll3JMSInventory();

    if (items.length === 0) {
      console.log('⚠️  No items found to export');
      return;
    }

    // Convert to CSV
    console.log('Converting to CSV format...');
    const csv = convertToCSV(items);

    // Write to file
    const filename = `3jms-inventory-export-${new Date().toISOString().split('T')[0]}.csv`;
    fs.writeFileSync(filename, csv, 'utf8');

    console.log(`\n✅ Export complete!`);
    console.log(`   File: ${filename}`);
    console.log(`   Items: ${items.length}`);
    console.log(`   Size: ${(fs.statSync(filename).size / 1024).toFixed(2)} KB`);
    console.log(`\n📝 You can now upload this CSV to Google Sheets`);

  } catch (error) {
    console.error('❌ Export failed:', error);
    process.exit(1);
  }
}

// Run the export
exportToCSV();
