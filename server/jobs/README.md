# Jobs Module

This directory contains the job queue system and state machine for async image processing.

## Files

- `state-machine.js` - Job state transitions and validation
- `manager.js` - Job CRUD operations and business logic
- `routes.js` - Express routes for job endpoints
- `shopify-sync.js` - Shopify product media sync logic
- `polling.js` - 3JMS image polling fallback (if webhook unavailable)
- `cleanup.js` - Job expiration and cleanup tasks

## Job Lifecycle

```
NEW → QUEUED → SEGMENTING → BG_GENERATING → COMPOSITING → SHOPIFY_PUSH → DONE
                                                                          ↓
                                                                       FAILED
```

## API Endpoints (to be implemented)

- `POST /webhooks/3jms/images` - Receive 3JMS webhook
- `POST /jobs/:id/start` - Start job processing
- `GET /jobs/:id` - Get job status
- `POST /jobs/:id/presign` - Get S3 presigned URLs
- `POST /jobs/:id/segmentation` - Update with segmentation results
- `POST /jobs/:id/backgrounds` - Update with background results
- `POST /jobs/:id/composite` - Trigger compositing
- `POST /jobs/:id/shopify` - Update with Shopify results
- `POST /jobs/:id/fail` - Mark job as failed
