/**
 * Webhook HMAC Verification
 *
 * Verifies webhook signatures from 3JMS and other services
 * to ensure requests are authentic and haven't been tampered with.
 */

import crypto from 'crypto';

/**
 * Verify HMAC signature for webhook request
 *
 * @param {string} payload - Raw request body (as string)
 * @param {string} signature - Signature from request header
 * @param {string} secret - Webhook secret key
 * @param {string} algorithm - Hash algorithm (default: 'sha256')
 * @returns {boolean} True if signature is valid
 */
export function verifyHMAC(payload, signature, secret, algorithm = 'sha256') {
  if (!payload || !signature || !secret) {
    return false;
  }

  // Calculate expected signature
  const hmac = crypto.createHmac(algorithm, secret);
  hmac.update(payload);
  const expectedSignature = hmac.digest('hex');

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    // Lengths don't match
    return false;
  }
}

/**
 * Express middleware for 3JMS webhook verification
 *
 * Usage:
 *   app.post('/webhooks/3jms/images', verify3JMSWebhook, (req, res) => { ... })
 *
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {function} next - Express next middleware
 */
export function verify3JMSWebhook(req, res, next) {
  const secret = process.env.TJMS_WEBHOOK_SECRET;

  // In production, webhook secret is REQUIRED
  if (process.env.NODE_ENV === 'production') {
    if (!secret) {
      console.error('[WebhookVerify] ❌ CRITICAL: TJMS_WEBHOOK_SECRET not configured in production');
      return res.status(500).json({
        error: 'Server misconfiguration: webhook secret not set in production'
      });
    }
  }

  // In development, allow skipping verification ONLY if explicitly enabled
  if (process.env.NODE_ENV !== 'production' && process.env.SKIP_WEBHOOK_VERIFICATION === 'true') {
    if (!secret) {
      console.warn('[WebhookVerify] ⚠️  SKIP_WEBHOOK_VERIFICATION enabled - allowing unsigned webhook (development only)');
      return next();
    }
  }

  // If secret is not configured in development, reject the request
  if (!secret) {
    console.error('[WebhookVerify] ❌ TJMS_WEBHOOK_SECRET not configured');
    return res.status(500).json({
      error: 'Webhook secret not configured',
      hint: 'Set TJMS_WEBHOOK_SECRET in .env file'
    });
  }

  // Get signature from header (check multiple possible header names)
  const signature =
    req.headers['x-3jms-signature'] ||
    req.headers['x-webhook-signature'] ||
    req.headers['x-signature'];

  if (!signature) {
    console.error('[WebhookVerify] ❌ Missing signature header');
    return res.status(401).json({ error: 'Missing webhook signature' });
  }

  // Get raw body (must be string, not parsed JSON)
  // Note: Express must be configured with express.raw() or similar for webhook routes
  const payload = req.rawBody || JSON.stringify(req.body);

  // Verify signature
  const isValid = verifyHMAC(payload, signature, secret);

  if (!isValid) {
    console.error('[WebhookVerify] ❌ Invalid signature');
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  console.log('[WebhookVerify] ✅ Signature verified');
  next();
}

/**
 * Generate HMAC signature for outgoing webhooks
 * (useful for testing or sending webhooks to other services)
 *
 * @param {string} payload - Request body (as string)
 * @param {string} secret - Webhook secret key
 * @param {string} algorithm - Hash algorithm (default: 'sha256')
 * @returns {string} HMAC signature (hex)
 */
export function generateHMAC(payload, secret, algorithm = 'sha256') {
  const hmac = crypto.createHmac(algorithm, secret);
  hmac.update(payload);
  return hmac.digest('hex');
}

/**
 * Express middleware to capture raw body for webhook verification
 * Must be used BEFORE express.json() middleware
 *
 * Usage:
 *   app.use('/webhooks', captureRawBody);
 *   app.use(express.json());
 *   app.post('/webhooks/3jms/images', verify3JMSWebhook, ...);
 */

// Maximum webhook payload size: 10MB (prevent memory exhaustion attacks)
const MAX_WEBHOOK_SIZE = 10 * 1024 * 1024;

export function captureRawBody(req, res, next) {
  if (!req.path.startsWith('/webhooks')) {
    return next();
  }

  let data = '';
  let size = 0;

  req.setEncoding('utf8');

  req.on('data', chunk => {
    size += Buffer.byteLength(chunk, 'utf8');

    // Reject if payload exceeds max size
    if (size > MAX_WEBHOOK_SIZE) {
      console.error(`[RawBody] ❌ Payload too large: ${size} bytes (max: ${MAX_WEBHOOK_SIZE})`);
      req.removeAllListeners('data');
      req.removeAllListeners('end');
      req.destroy();
      return res.status(413).json({
        error: 'Payload too large',
        maxSize: `${MAX_WEBHOOK_SIZE / 1024 / 1024}MB`
      });
    }

    data += chunk;
  });

  req.on('error', (error) => {
    console.error('[RawBody] ❌ Stream error:', error);
    if (!res.headersSent) {
      res.status(400).json({ error: 'Invalid request' });
    }
  });

  req.on('end', () => {
    req.rawBody = data;
    next();
  });
}

export default {
  verifyHMAC,
  verify3JMSWebhook,
  generateHMAC,
  captureRawBody
};
