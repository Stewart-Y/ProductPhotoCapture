# Integrations Module

This directory contains external system integrations (Shopify, n8n, 3JMS).

## Files

- `shopify.js` - Shopify Admin GraphQL API client
- `n8n.js` - n8n workflow trigger client
- `tjms.js` - 3JMS REST API client (move from root)

## Shopify Client

Handles product media uploads using Shopify Admin GraphQL API:

```javascript
// Find product by SKU
const product = await shopify.findProductBySKU('VWS200433868');

// Stage file upload
const stagedTarget = await shopify.stagedUploadCreate({
  filename: 'bottle.jpg',
  mimeType: 'image/jpeg',
  resource: 'PRODUCT_IMAGE'
});

// Upload file to staged URL
await shopify.uploadFile(stagedTarget.url, localFilePath);

// Attach media to product
await shopify.productCreateMedia(productId, [stagedTarget]);
```

### Shopify API Scopes Required
- `read_products` - Search for products by SKU
- `write_products` - Update product metadata
- `write_files` - Upload media files

### Rate Limiting
Shopify has strict rate limits (40 requests/second for REST API, 50 points/second for GraphQL). The client includes automatic retry with exponential backoff.

## n8n Client

Triggers n8n workflows via webhook:

```javascript
// Trigger workflow
await n8n.triggerWorkflow('3jms-to-shopify', {
  jobId: 'job-123',
  sku: 'VWS200433868',
  imageUrl: 'https://...'
});
```

## 3JMS Client

Extended version of existing `tjms-client.js`:

```javascript
// Fetch subimages for an item
const subimages = await tjms.getSubImages(itemId);

// Upload subimage
await tjms.createSubImage(itemId, imageFile, metadata);

// Delete subimage
await tjms.deleteSubImage(subimageId);
```

### Authentication
3JMS uses Token-based auth:
```
Authorization: Token {TJMS_API_TOKEN}
```

### Rate Limit
40 requests/minute (enforced by 3JMS)
