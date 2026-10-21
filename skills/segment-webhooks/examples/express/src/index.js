require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Segment webhook signature.
 *
 * Segment sends X-Signature = hex(HMAC-SHA1(sharedSecret, body)). When batching
 * is enabled the body is a JSON array, but Segment signs only the FIRST event
 * (JSON.stringify(batch[0])), so a raw-body check alone fails for batches.
 *
 * @param {Buffer|string} rawBody - Raw request body
 * @param {string|undefined} signature - X-Signature header value
 * @param {string|undefined} secret - Shared Secret from the destination settings
 * @returns {boolean} - Whether the signature is valid
 */
function verifySegmentSignature(rawBody, signature, secret) {
  if (!signature || !secret) {
    return false;
  }

  const matches = (content) => {
    const expected = crypto
      .createHmac('sha1', secret)
      .update(content, 'utf8')
      .digest('hex');
    // Timing-safe comparison; throws on length mismatch
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  };

  // Single event: the signature covers the raw body
  if (matches(rawBody)) {
    return true;
  }

  // Batched delivery: Segment signs only the first event in the array.
  // Note that only that first event is authenticated by the signature.
  try {
    const parsed = JSON.parse(rawBody.toString('utf8'));
    return Array.isArray(parsed) && parsed.length > 0 && matches(JSON.stringify(parsed[0]));
  } catch {
    return false;
  }
}

/**
 * Handle a single Segment spec call, dispatching on its `type`.
 */
function handleSegmentEvent(event) {
  switch (event.type) {
    case 'track':
      console.log(`Track "${event.event}" for ${event.userId || event.anonymousId}`);
      // TODO: Trigger workflows, update usage counters, sync conversions
      break;

    case 'identify':
      console.log(`Identify ${event.userId || event.anonymousId}:`, event.traits);
      // TODO: Upsert the user in your database or CRM
      break;

    case 'page':
      console.log(`Page view: ${event.properties?.path || event.name}`);
      // TODO: Content analytics
      break;

    case 'screen':
      console.log(`Screen view: ${event.name}`);
      // TODO: Mobile analytics
      break;

    case 'group':
      console.log(`Group ${event.groupId} for ${event.userId}`);
      // TODO: Sync the account/organization
      break;

    case 'alias':
      console.log(`Alias ${event.previousId} -> ${event.userId}`);
      // TODO: Merge user records
      break;

    case 'delete':
      // Classic Webhooks destination only: user deletion request notification
      console.log(`Delete request for ${event.userId}`);
      // TODO: Start your data-deletion automation
      break;

    default:
      console.log(`Unhandled Segment call type: ${event.type}`);
  }
}

// Segment webhook endpoint - must use the raw body for signature verification
app.post('/webhooks/segment',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.SEGMENT_SHARED_SECRET;
    if (!secret) {
      console.error('SEGMENT_SHARED_SECRET is not configured');
      return res.status(500).send('Webhook secret not configured');
    }

    const signature = req.headers['x-signature'];
    if (!signature) {
      return res.status(400).send('Missing X-Signature header');
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!verifySegmentSignature(rawBody, signature, secret)) {
      console.error('Segment webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse only after verification
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // Batching sends an array of events; otherwise a single event object
    const events = Array.isArray(payload) ? payload : [payload];
    for (const event of events) {
      // Use event.messageId to de-duplicate retried deliveries
      handleSegmentEvent(event);
    }

    res.status(200).json({ received: true, count: events.length });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifySegmentSignature };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/segment`);
  });
}
