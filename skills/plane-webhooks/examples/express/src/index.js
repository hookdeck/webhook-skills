require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// X-Plane-Signature is exactly 64 hex characters (HMAC-SHA256), no prefix
const SIGNATURE_PATTERN = /^[0-9a-fA-F]{64}$/;

/**
 * Verify Plane webhook signature
 * @param {Buffer} rawBody - Raw request body bytes, exactly as received
 * @param {string} signature - X-Plane-Signature header (bare hex HMAC-SHA256)
 * @param {string} secret - Plane webhook secret key (plane_wh_...), used as UTF-8 bytes
 * @returns {boolean} - Whether signature is valid
 */
function verifyPlaneWebhook(rawBody, signature, secret) {
  if (typeof signature !== 'string' || !SIGNATURE_PATTERN.test(signature) || !secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(rawBody)
    .digest();
  // Hex is case-insensitive; the alphabet and length were validated above
  const received = Buffer.from(signature.toLowerCase(), 'hex');

  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

// Plane's docs show one work item example whose `event` holds an enum label
// instead of `workitem.updated`
const EVENT_ALIASES = {
  'WebhookScope.ScopeChoices.WORK_ITEM_UPDATED': 'workitem.updated',
};

// Plane webhook endpoint - raw body of any content type, so the exact bytes are verified
app.post('/webhooks/plane',
  express.raw({ type: '*/*' }),
  (req, res) => {
    if (!process.env.PLANE_WEBHOOK_SECRET) {
      console.error('PLANE_WEBHOOK_SECRET is not set');
      return res.status(500).send('Webhook secret not configured');
    }

    if (!Buffer.isBuffer(req.body) ||
        !verifyPlaneWebhook(req.body, req.headers['x-plane-signature'], process.env.PLANE_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse only after verification, then treat every field as untrusted
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }
    if (!isObject(payload) || typeof payload.event !== 'string') {
      return res.status(400).send('Invalid payload');
    }

    const event = EVENT_ALIASES[payload.event] || payload.event;
    const data = isObject(payload.data) ? payload.data : {};
    const name = typeof data.name === 'string' ? data.name : undefined;

    // event_id is stable across retries; delivery_id changes on every attempt
    console.log(`Received ${event} event (event_id: ${payload.event_id}, delivery: ${payload.delivery_id})`);

    switch (event) {
      case 'workitem.created':
        console.log('Work item created:', name);
        // TODO: Sync to your tracker, notify a channel, etc.
        break;

      case 'workitem.updated': {
        const changed = isObject(payload.previous_attributes) ? Object.keys(payload.previous_attributes) : [];
        console.log(`Work item updated: ${name} (changed: ${changed.join(', ') || 'none'})`);
        // TODO: React to state or assignee changes, etc.
        break;
      }

      case 'workitem.deleted':
        console.log('Work item deleted:', payload.entity_id);
        // TODO: Remove the work item from your own records
        break;

      case 'workitem.comment.created': {
        const comment = isObject(data.comment) ? data.comment : {};
        const text = typeof comment.comment_stripped === 'string' ? comment.comment_stripped : undefined;
        console.log(`Comment on "${name}":`, text);
        // TODO: Bot commands, notifications, etc.
        break;
      }

      case 'project.updated':
        console.log('Project updated:', name);
        // TODO: Refresh cached project details
        break;

      case 'cycle.created':
        console.log('Cycle created:', name);
        // TODO: Announce the new cycle, etc.
        break;

      default:
        console.log(`Unhandled event: ${event}`);
    }

    res.status(200).send('OK');
  }
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyPlaneWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/plane`);
  });
}
