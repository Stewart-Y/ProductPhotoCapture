# AI Providers Module

This directory contains pluggable AI provider integrations for segmentation and background generation.

## Structure

```
providers/
├── base.js           # Base provider interface/abstract class
├── index.js          # Provider factory and registry
├── replicate/        # Replicate API implementations
│   ├── segment.js    # Background removal (rembg, MODNet, SAM)
│   ├── background.js # Background generation (SDXL, FLUX)
│   └── upscale.js    # Image upscaling (Real-ESRGAN) - legacy
└── fal/              # fal.ai implementations (future)
    ├── segment.js
    └── background.js
```

## Base Provider Interface

All providers must implement:

```javascript
class BaseProvider {
  async startJob(inputUrl, options) {
    // Returns: { jobId, status: 'queued'|'processing' }
  }

  async getStatus(jobId) {
    // Returns: { status, progress?, resultUrl?, error? }
  }

  async cancel(jobId) {
    // Cancels a running job
  }

  estimateCost(options) {
    // Returns estimated cost in USD
  }
}
```

## Provider Selection

Configured via environment variables:
- `AI_SEGMENT_MODEL` - Model ID for segmentation
- `AI_BG_MODEL` - Model ID for background generation

## Retry Logic

All providers include exponential backoff retry (3 attempts):
- 1st retry: 2s delay
- 2nd retry: 4s delay
- 3rd retry: 8s delay
