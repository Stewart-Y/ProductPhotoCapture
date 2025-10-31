# Storage Module

This directory contains storage abstraction layer for S3 and local filesystem.

## Files

- `index.js` - Storage factory (chooses S3 or local based on config)
- `s3.js` - AWS S3 client with presigned URL generation
- `local.js` - Local filesystem fallback (for development)

## S3 Key Structure

```
s3://product-photos-ai/
├── originals/
│   └── {sku}/
│       └── {sha256}.jpg
├── masks/
│   └── {sku}/
│       └── {sha256}.png
├── backgrounds/
│   └── {theme}/
│       └── {sku}/
│           ├── {sha256}_1x1_1.jpg
│           └── {sha256}_4x5_1.jpg
├── composites/
│   └── {theme}/
│       └── {sku}/
│           ├── {sha256}_1x1_master.jpg      # 3000px
│           ├── {sha256}_1x1_shopify.jpg     # 2048px
│           ├── {sha256}_4x5_master.jpg
│           └── {sha256}_4x5_shopify.webp
└── thumbs/
    └── {sku}/
        └── {sha256}_400.jpg
```

## Presigned URLs

Used to allow n8n workflows and AI providers to directly upload/download without exposing credentials:

```javascript
// Generate presigned PUT URL (upload)
const putUrl = await storage.presignPut('originals/SKU123/abc.jpg', 'image/jpeg', 3600);

// Generate presigned GET URL (download)
const getUrl = await storage.presignGet('masks/SKU123/abc.png', 3600);
```

## Environment Variables

- `AWS_REGION` - AWS region (e.g., us-east-1)
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key
- `S3_BUCKET` - S3 bucket name
- `S3_PUBLIC_BASE` - Public CDN URL (optional)
