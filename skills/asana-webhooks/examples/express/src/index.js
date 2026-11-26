// Generated with: asana-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify an Asana webhook signature.
 *
 * Asana signs each event delivery with an HMAC-SHA256 (hex) of the RAW request
 * body, keyed with the secret captured during the handshake.
 *
 * @param {Buffer} rawBody - Raw request body (do not parse before verifying)
 * @param {string} signatureHeader - X-Hook-Signature header value (hex)
 * @param {string} secret - Stored X-Hook-Secret for this webhook
 * @returns {boolean} Whether the signature is valid
 */
function verifyAsanaSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; guard against length/format mismatches.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

// Asana webhook endpoint. Must use the raw body for signature verification.
app.post(
  '/webhooks/asana',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    const hookSecret = req.headers['x-hook-secret'];
    const signature = req.headers['x-hook-signature'];

    // --- Phase 1: Handshake ---
    // On webhook creation Asana sends X-Hook-Secret and no signature.
    // Echo the secret back, store it, and return 200.
    if (hookSecret) {
      // Your code: Persist `hookSecret` keyed by the webhook so future deliveries can
      // be verified. This example reads ASANA_WEBHOOK_SECRET from the env instead.
      console.log('Handshake received; echoing X-Hook-Secret');
      res.set('X-Hook-Secret', hookSecret);
      return res.status(200).send();
    }

    // --- Phase 2: Event delivery ---
    if (!verifyAsanaSignature(req.body, signature, process.env.ASANA_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse only after verifying the raw body.
    const payload = JSON.parse(req.body.toString('utf8'));
    const events = payload.events || [];

    // Heartbeats arrive as an empty events array — acknowledge and return.
    if (events.length === 0) {
      console.log('Heartbeat received');
      return res.status(200).send('OK');
    }

    for (const event of events) {
      handleAsanaEvent(event);
    }

    // Acknowledge quickly (Asana times out after 10s). Do heavy work async.
    res.status(200).send('OK');
  }
);

/**
 * Dispatch a single compact Asana event.
 * Events name what changed; fetch full details via the API using resource.gid.
 */
function handleAsanaEvent(event) {
  const resourceType = event.resource?.resource_type;
  const gid = event.resource?.gid;

  switch (event.action) {
    case 'added':
      console.log(`Added ${resourceType} ${gid}`);
      // Your code: Sync the new resource into your system.
      break;

    case 'changed':
      console.log(`Changed ${resourceType} ${gid} (field: ${event.change?.field})`);
      // Your code: Fetch the resource and update your mirror.
      break;

    case 'removed':
      console.log(`Removed ${resourceType} ${gid} from parent ${event.parent?.gid}`);
      // Your code: Update parent membership.
      break;

    case 'deleted':
      console.log(`Deleted ${resourceType} ${gid}`);
      // Your code: Soft-delete or archive in your system.
      break;

    case 'undeleted':
      console.log(`Undeleted ${resourceType} ${gid}`);
      // Your code: Restore in your system.
      break;

    default:
      console.log(`Unhandled action: ${event.action}`);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export for testing
module.exports = { app, verifyAsanaSignature };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/asana`);
  });
}
