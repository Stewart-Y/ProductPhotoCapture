import fetch from 'node-fetch';

// Load configuration from environment variables
const TJMS_BASE_URL = process.env.TJMS_API_BASE_URL || 'https://3jms.vistawinespirits.com';
const TJMS_API_TOKEN = process.env.TJMS_API_KEY;

// Validate required environment variables
if (!TJMS_API_TOKEN) {
  console.error('[TJMS] ERROR: TJMS_API_KEY environment variable is not set');
  console.error('[TJMS] Please add TJMS_API_KEY to your .env file');
  throw new Error('TJMS_API_KEY is required. Check your .env file.');
}

/**
 * 3JMS API Client for Vista Wine & Spirits integration
 */
class TJMSClient {
  constructor() {
    this.baseUrl = TJMS_BASE_URL;
    this.token = TJMS_API_TOKEN;
    this.headers = {
      'Authorization': `Token ${this.token}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Make API request to 3JMS
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      ...options,
      headers: {
        ...this.headers,
        ...options.headers
      }
    };

    console.log(`[3JMS] ${options.method || 'GET'} ${url}`);
    
    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`3JMS API Error (${response.status}): ${error}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('[3JMS] Request failed:', error);
      throw error;
    }
  }

  /**
   * Get all inventory items (limited for regular employees)
   */
  async getInventory(page = 1, pageSize = 100) {
    return this.request(`/api/v1/inventory?page=${page}&page_size=${pageSize}`);
  }

  /**
   * Get all inventory SKUs (full access)
   */
  async getAllInventorySKUs(page = 1, pageSize = 100) {
    return this.request(`/api/v1/inventory/sku/all/?page=${page}`);
  }

  /**
   * Search inventory items
   */
  async searchInventory(query) {
    return this.request(`/api/v1/inventory/ajax_item_search?search=${encodeURIComponent(query)}`);
  }

  /**
   * Get single item by ID
   */
  async getItem(itemId) {
    return this.request(`/api/v1/inventory/${itemId}`);
  }

  /**
   * Create new item
   */
  async createItem(itemData) {
    return this.request('/api/v1/inventory/create_item', {
      method: 'POST',
      body: JSON.stringify(itemData)
    });
  }

  /**
   * Update item
   */
  async updateItem(itemId, itemData) {
    return this.request(`/api/v1/inventory/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(itemData)
    });
  }

  /**
   * Get all items with pagination handling (using SKU/all endpoint for full access)
   */
  async getAllInventory() {
    const allItems = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        console.log(`[3JMS] Fetching SKU page ${page}...`);
        const response = await this.getAllInventorySKUs(page, 100);
        
        if (response.results && response.results.length > 0) {
          allItems.push(...response.results);
          page++;
          hasMore = response.next !== null;
        } else {
          hasMore = false;
        }

        // Rate limit: 40 requests/minute = ~1.5 seconds between requests
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 1600));
        }
      } catch (error) {
        // Stop on 404 or any error (means no more pages)
        console.log(`[3JMS] Stopped at page ${page}: ${error.message}`);
        hasMore = false;
      }
    }

    console.log(`[3JMS] Fetched ${allItems.length} total SKUs`);
    return allItems;
  }
}

export default new TJMSClient();
