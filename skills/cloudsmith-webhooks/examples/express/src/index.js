// Generated with: cloudsmith-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

const HEX_SHA1 = /^[0-9a-fA-F]{40}$/;

/**
 * Verify a Cloudsmith webhook signature.
 * Cloudsmith sends the bare hex HMAC-SHA1 of the raw body (key = the webhook's
 * HMAC Signature Key, UTF-8) in the X-Cloudsmith-Signature header.
 * @param {Buffer} rawBody - Raw request body, exactly as received
 * @param {string|undefined} signature - X-Cloudsmith-Signature header value
 * @param {string|undefined} secret - The webhook's HMAC Signature Key
 * @returns {boolean} - Whether the signature is valid
 */
function verifyCloudsmithWebhook(rawBody, signature, secret) {
  if (!signature || !secret || !HEX_SHA1.test(signature)) {
    return false;
  }

  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest();
  // The format was checked above, so decoding cannot silently drop characters
  const received = Buffer.from(signature, 'hex');

  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

function handleEvent(item) {
  // Every field of the body is untrusted: check types before reading into it
  const meta = isObject(item.meta) ? item.meta : {};
  const data = isObject(item.data) ? item.data : {};
  const eventId = typeof meta.event_id === 'string' ? meta.event_id : undefined;
  const pkg = [data.namespace, data.repository, data.name]
    .filter((part) => typeof part === 'string')
    .join('/');
  console.log(`Received ${eventId ?? 'unknown event'} (trigger ${meta.trigger_id ?? 'n/a'})`);

  switch (eventId) {
    case 'ping':
      console.log('Cloudsmith ping received');
      break;

    case 'package.created':
      console.log(`Package created: ${pkg}`);
      // TODO: Record the new upload
      break;

    case 'package.syncing':
    case 'package.synced':
      console.log(`${eventId}: ${pkg} (${data.stage_str ?? 'unknown stage'})`);
      // TODO: package.synced means the package is ready to download
      break;

    case 'package.security_scanned':
      console.log(`Security scan finished: ${pkg}`);
      // TODO: Fetch the scan results from the Cloudsmith API
      break;

    case 'package.quarantined':
      console.log(`Package quarantined: ${pkg}`);
      // TODO: Alert the owning team
      break;

    case 'package.failed':
      console.log(`Package failed: ${pkg}`);
      break;

    case 'package.released':
    case 'package.restored':
    case 'package.tags_updated':
    case 'package.deleted':
      console.log(`${eventId}: ${pkg}`);
      break;

    default:
      console.log(`Unhandled event: ${eventId}`);
  }
}

// Cloudsmith webhook endpoint - express.raw with '*/*' keeps the body as a Buffer
// whatever the Content-Type, so the signature always covers the exact bytes
app.post('/webhooks/cloudsmith',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

    if (!verifyCloudsmithWebhook(rawBody, req.get('x-cloudsmith-signature'), process.env.CLOUDSMITH_WEBHOOK_SECRET)) {
      console.error('Cloudsmith webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse the payload only after verification
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // Default "JSON Object" format is one event; "JSON Array" wraps it in [...]
    const items = Array.isArray(payload) ? payload : [payload];
    if (!items.every(isObject)) {
      return res.status(400).send('Unexpected payload shape');
    }
    items.forEach(handleEvent);

    res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyCloudsmithWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/cloudsmith`);
  });
}
