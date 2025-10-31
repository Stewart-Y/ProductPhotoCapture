# AWS S3 Setup Guide

This guide will help you set up AWS S3 storage for the AI background generation pipeline.

## Step 1: Create an S3 Bucket

1. **Log in to AWS Console**: https://console.aws.amazon.com/s3/
2. **Click "Create bucket"**
3. **Configure bucket**:
   - **Bucket name**: `product-photos-ai` (must be globally unique, choose your own)
   - **AWS Region**: `us-east-1` (or your preferred region)
   - **Object Ownership**: ACLs disabled (recommended)
   - **Block Public Access**: Keep all 4 checkboxes **CHECKED** (we'll use presigned URLs, not public access)
   - **Bucket Versioning**: Disabled (optional: enable for backup)
   - **Default encryption**: Enable with SSE-S3
4. **Click "Create bucket"**

## Step 2: Create IAM User with S3 Access

1. **Go to IAM Console**: https://console.aws.amazon.com/iam/
2. **Click "Users" → "Create user"**
3. **User name**: `product-photos-ai-service`
4. **Click "Next"**
5. **Set permissions**:
   - Choose "Attach policies directly"
   - Search for and select: **`AmazonS3FullAccess`** (for development)
   - OR create a custom policy for production (see below)
6. **Click "Next" → "Create user"**

## Step 3: Generate Access Keys

1. **Click on the user** you just created
2. **Go to "Security credentials" tab**
3. **Click "Create access key"**
4. **Use case**: Select "Application running outside AWS"
5. **Click "Next" → "Create access key"**
6. **IMPORTANT**: Copy the following and save them securely:
   - **Access key ID**: `AKIAIOSFODNN7EXAMPLE`
   - **Secret access key**: `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`
7. **Download .csv file** (backup)

## Step 4: Create S3 Folder Structure

The system will auto-create folders, but you can pre-create them:

1. **Open your bucket**
2. **Click "Create folder"** for each of these:
   - `originals/`
   - `masks/`
   - `backgrounds/`
   - `composites/`
   - `thumbs/`

## Step 5: Configure CORS (if accessing from browser)

**Only needed if frontend directly uploads to S3**

1. **Go to bucket** → **Permissions** tab
2. **Scroll to "Cross-origin resource sharing (CORS)"**
3. **Click "Edit"**
4. **Paste this configuration**:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST"],
    "AllowedOrigins": [
      "http://localhost:5173",
      "https://product-photos.click"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

5. **Click "Save changes"**

## Step 6: Update .env File

Copy your AWS credentials to `server/.env`:

```bash
# AWS S3 Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
S3_BUCKET=product-photos-ai
S3_PUBLIC_BASE=https://product-photos-ai.s3.us-east-1.amazonaws.com
S3_PRESIGNED_URL_EXPIRY=3600
```

**Replace**:
- `us-east-1` with your chosen region
- `AKIAIOSFODNN7EXAMPLE` with your actual access key ID
- `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` with your actual secret key
- `product-photos-ai` with your actual bucket name

## Step 7: Test S3 Connection

Run this test script to verify your setup:

```bash
cd server
node -e "
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const command = new PutObjectCommand({
  Bucket: process.env.S3_BUCKET || 'product-photos-ai',
  Key: 'test/connection-test.txt',
  Body: 'Connection test successful!',
  ContentType: 'text/plain'
});

try {
  await s3.send(command);
  console.log('✅ S3 connection successful!');
} catch (error) {
  console.error('❌ S3 connection failed:', error.message);
}
"
```

## Production Best Practices

### 1. Use Least-Privilege IAM Policy

Instead of `AmazonS3FullAccess`, create a custom policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ProductPhotosAIAccess",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::product-photos-ai",
        "arn:aws:s3:::product-photos-ai/*"
      ]
    }
  ]
}
```

### 2. Enable S3 Lifecycle Policies

Auto-delete old temp files:

1. **Bucket** → **Management** tab
2. **Create lifecycle rule**:
   - **Name**: "Delete old temp files"
   - **Scope**: Prefix = `temp/`
   - **Actions**: Expire current versions of objects
   - **Days after object creation**: 7
3. **Create rule**

### 3. Enable S3 Access Logging (optional)

Track all S3 API calls for auditing:

1. **Create a separate bucket** for logs: `product-photos-ai-logs`
2. **Main bucket** → **Properties** → **Server access logging**
3. **Enable** and point to log bucket

### 4. Set Up CloudWatch Alarms

Monitor S3 costs and usage:

1. **CloudWatch** → **Alarms** → **Create alarm**
2. **Metric**: `EstimatedCharges` (for all AWS services)
3. **Condition**: Greater than $100/month
4. **Notification**: Email alert

## Cost Estimate

Assuming 1,000 jobs/month with 5 images each:

| Item | Usage | Cost/Month |
|------|-------|------------|
| **Storage** | 10 GB (5,000 images × 2 MB) | $0.23 |
| **PUT Requests** | 25,000 (5 images × 5 files each) | $0.13 |
| **GET Requests** | 50,000 (downloads for processing) | $0.02 |
| **Data Transfer Out** | 20 GB (public downloads) | $1.80 |
| **TOTAL** | | **~$2.18/month** |

*Prices based on us-east-1 region, January 2025*

## Troubleshooting

### Error: "Access Denied"
- ✅ Check IAM user has `AmazonS3FullAccess` or custom policy
- ✅ Verify access key ID and secret key are correct
- ✅ Ensure bucket name matches exactly (case-sensitive)

### Error: "Bucket does not exist"
- ✅ Check bucket name in `.env` matches AWS Console
- ✅ Verify region is correct (bucket in us-east-1 but code uses us-west-2)

### Error: "SignatureDoesNotMatch"
- ✅ Secret access key is incorrect or has spaces/newlines
- ✅ System clock is accurate (AWS requires time sync)

### Error: "SlowDown" or "RequestLimitExceeded"
- ✅ Reduce concurrent uploads (add queue/rate limiting)
- ✅ Implement exponential backoff retry logic

## Next Steps

Once S3 is set up:
1. ✅ Install AWS SDK: `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`
2. ✅ Test presigned URL generation (see `server/storage/s3.js`)
3. ✅ Configure Replicate API token for AI providers
4. ✅ Set up Shopify Admin API credentials

## Resources

- [AWS S3 Pricing Calculator](https://calculator.aws/)
- [AWS SDK for JavaScript v3 Docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/)
- [S3 Best Practices](https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html)
