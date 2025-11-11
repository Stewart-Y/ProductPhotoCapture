/**
 * Shopify Admin API Client
 *
 * Handles product lookups and image uploads to Shopify store
 * Uses Admin REST API v2024-10
 */

import fetch from 'node-fetch';

/**
 * Shopify API Configuration
 */
const SHOPIFY_CONFIG = {
  storeDomain: process.env.SHOPIFY_STORE_DOMAIN || 'yassine-sotre-do-not-touch.myshopify.com',
  accessToken: process.env.SHOPIFY_ACCESS_TOKEN || '',
  apiVersion: '2024-10'
};

/**
 * Build Shopify Admin API URL
 */
function buildApiUrl(endpoint) {
  const domain = SHOPIFY_CONFIG.storeDomain;
  const version = SHOPIFY_CONFIG.apiVersion;
  return `https://${domain}/admin/api/${version}/${endpoint}`;
}

/**
 * Make authenticated request to Shopify API
 */
async function shopifyRequest(endpoint, options = {}) {
  const url = buildApiUrl(endpoint);
  const token = SHOPIFY_CONFIG.accessToken;

  if (!token) {
    throw new Error('Shopify access token not configured. Set SHOPIFY_ACCESS_TOKEN environment variable.');
  }

  const headers = {
    'X-Shopify-Access-Token': token,
    'Content-Type': 'application/json',
    ...options.headers
  };

  console.log(`[Shopify API] ${options.method || 'GET'} ${endpoint}`);

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Shopify API] Error ${response.status}:`, errorText);
    throw new Error(`Shopify API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

/**
 * Find product by SKU
 * Searches product variants for matching SKU
 *
 * @param {string} sku - Product SKU
 * @param {object} db - Database connection for caching
 * @returns {object} { productId, variantId, title, handle } or null
 */
export async function findProductBySKU(sku, db = null) {
  console.log(`[Shopify] Looking up product by SKU: ${sku}`);

  // Check cache first
  if (db) {
    const cached = db.prepare(`
      SELECT product_id, variant_id, product_handle, last_synced
      FROM shopify_map
      WHERE sku = ? AND sync_status = 'active'
    `).get(sku);

    if (cached) {
      console.log(`[Shopify] Cache hit for SKU ${sku}: ${cached.product_id}`);
      return {
        productId: cached.product_id,
        variantId: cached.variant_id,
        handle: cached.product_handle,
        cached: true
      };
    }
  }

  // Search Shopify for product with this SKU
  // Note: Shopify doesn't have direct SKU search, so we need to search variants
  try {
    // Fetch products (API 2024-10 removed page parameter, just use limit)
    console.log(`[Shopify] Fetching up to 250 products to search for SKU: ${sku}`);
    const data = await shopifyRequest('products.json?limit=250');

    if (!data.products || data.products.length === 0) {
      console.warn(`[Shopify] No products found in store`);
      return null;
    }

    console.log(`[Shopify] Searching through ${data.products.length} products...`);

    // Search through variants
    let found = null;
    for (const product of data.products) {
      const variant = product.variants?.find(v => v.sku === sku);

      if (variant) {
        found = {
          productId: `gid://shopify/Product/${product.id}`,
          variantId: `gid://shopify/ProductVariant/${variant.id}`,
          title: product.title,
          handle: product.handle
        };

        console.log(`[Shopify] Found product for SKU ${sku}: ${product.title} (ID: ${product.id})`);

        // Cache the result
        if (db) {
          db.prepare(`
            INSERT OR REPLACE INTO shopify_map (sku, product_id, variant_id, product_handle, last_synced, sync_status)
            VALUES (?, ?, ?, ?, datetime('now'), 'active')
          `).run(sku, found.productId, found.variantId, found.handle);

          console.log(`[Shopify] Cached mapping: ${sku} → ${found.productId}`);
        }

        break;
      }
    }

    if (!found) {
      console.warn(`[Shopify] No product found for SKU: ${sku}`);
      return null;
    }

    return found;

  } catch (error) {
    console.error(`[Shopify] Error finding product by SKU:`, error);
    throw error;
  }
}

/**
 * Upload image to Shopify product
 * Creates a new product image attachment
 *
 * @param {string} productId - Shopify product GID or numeric ID
 * @param {string} imageUrl - Public URL of image to upload
 * @param {string} altText - Alt text for image (optional)
 * @param {number} position - Image position (optional, auto-appends if not specified)
 * @returns {object} { id, src, position, alt }
 */
export async function uploadProductImage(productId, imageUrl, altText = '', position = null) {
  console.log(`[Shopify] Uploading image to product ${productId}`);
  console.log(`[Shopify] Image URL: ${imageUrl}`);

  // Extract numeric ID from GID if needed
  const numericId = productId.includes('gid://')
    ? productId.split('/').pop()
    : productId;

  try {
    const payload = {
      image: {
        src: imageUrl,
        alt: altText || `Product image`
      }
    };

    if (position !== null) {
      payload.image.position = position;
    }

    const data = await shopifyRequest(`products/${numericId}/images.json`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    console.log(`[Shopify] Image uploaded successfully. Media ID: ${data.image.id}`);

    return {
      id: `gid://shopify/ProductImage/${data.image.id}`,
      numericId: data.image.id,
      src: data.image.src,
      position: data.image.position,
      alt: data.image.alt,
      width: data.image.width,
      height: data.image.height
    };

  } catch (error) {
    console.error(`[Shopify] Failed to upload image:`, error);
    throw error;
  }
}

/**
 * Upload multiple images to product
 * Uploads images in order, maintaining position sequence
 *
 * @param {string} productId - Shopify product GID or numeric ID
 * @param {Array<string>} imageUrls - Array of public image URLs
 * @param {string} altText - Base alt text (will append index)
 * @returns {Array<object>} Array of uploaded image results
 */
export async function uploadProductImages(productId, imageUrls, altText = 'Product photo') {
  console.log(`[Shopify] Uploading ${imageUrls.length} images to product ${productId}`);

  const results = [];

  for (let i = 0; i < imageUrls.length; i++) {
    try {
      const result = await uploadProductImage(
        productId,
        imageUrls[i],
        `${altText} ${i + 1}`,
        null // Let Shopify auto-append
      );
      results.push(result);

      // Rate limit: 2 requests per second max for Shopify
      if (i < imageUrls.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`[Shopify] Failed to upload image ${i + 1}:`, error);
      results.push({ error: error.message, url: imageUrls[i] });
    }
  }

  console.log(`[Shopify] Uploaded ${results.filter(r => !r.error).length}/${imageUrls.length} images successfully`);

  return results;
}

/**
 * Get product by ID
 * Fetches full product details
 *
 * @param {string} productId - Shopify product GID or numeric ID
 * @returns {object} Product details
 */
export async function getProduct(productId) {
  const numericId = productId.includes('gid://')
    ? productId.split('/').pop()
    : productId;

  const data = await shopifyRequest(`products/${numericId}.json`);
  return data.product;
}

/**
 * Test Shopify connection
 * Verifies API credentials are valid
 *
 * @returns {object} { success, store, error }
 */
export async function testConnection() {
  try {
    const data = await shopifyRequest('shop.json');

    console.log(`[Shopify] Connection test successful: ${data.shop.name}`);

    return {
      success: true,
      store: {
        name: data.shop.name,
        domain: data.shop.domain,
        email: data.shop.email,
        currency: data.shop.currency
      }
    };
  } catch (error) {
    console.error(`[Shopify] Connection test failed:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

export default {
  findProductBySKU,
  uploadProductImage,
  uploadProductImages,
  getProduct,
  testConnection
};
