// Generated with: maintainx-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

const WEBHOOK_SECRET = process.env.MAINTAINX_WEBHOOK_SECRET;
// MaintainX recommends rejecting timestamps older than 5 minutes (seconds)
const TOLERANCE_SECONDS = 300;

/**
 * Verify a MaintainX webhook signature.
 *
 * MaintainX sends `x-maintainx-webhook-body-signature: t=<unix>,v1=<hex>`.
 * v1 is HMAC-SHA256 (hex) over `{t}.{raw body}` keyed with the webhook secret.
 *
 * @param {Buffer|string} rawBody - the raw, unparsed request body
 * @param {string} header - the x-maintainx-webhook-body-signature header value
 * @param {string} secret - the webhook secret (raw string)
 * @param {number} toleranceSec - max allowed age of the timestamp
 * @returns {boolean}
 */
function verifyMaintainxSignature(rawBody, header, secret, toleranceSec = TOLERANCE_SECONDS) {
  if (!header || !secret) return false;

  // Parse "t=...,v1=..." into { t, v1 }
  const parts = Object.fromEntries(header.split(',').map((part) => part.split('=')));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  // Replay protection: reject stale timestamps
  const now = Math.floor(Date.now() / 1000);
  if (!(Math.abs(now - Number(timestamp)) <= toleranceSec)) return false;

  // Signed content is "{t}.{raw body}" — use the raw body, not parsed JSON
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${body}`, 'utf8')
    .digest('hex');

  // Timing-safe comparison (throws on length mismatch, which means invalid)
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

// MaintainX webhook endpoint - must use the raw body for signature verification
app.post('/webhooks/maintainx', express.raw({ type: '*/*' }), (req, res) => {
  const header = req.headers['x-maintainx-webhook-body-signature'];

  if (!header) {
    return res.status(400).send('Missing x-maintainx-webhook-body-signature header');
  }

  if (!verifyMaintainxSignature(req.body, header, WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  // Signature is valid — safe to parse the event
  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  switch (event.eventType) {
    case 'NEW_WORK_ORDER':
      console.log('New work order:', event.workOrderId);
      // TODO: Sync to ticketing/ERP, notify dispatch, etc.
      break;

    case 'WORK_ORDER_CHANGE':
      console.log('Work order changed:', event.workOrderId);
      // TODO: Update your external record
      break;

    case 'WORK_ORDER_STATUS_CHANGE':
      console.log(`Work order ${event.workOrderId}: ${event.oldStatus} -> ${event.newStatus}`);
      // TODO: Close linked tickets, trigger billing when DONE, etc.
      break;

    case 'NEW_WORK_REQUEST':
      console.log('New work request:', event.workRequestId);
      // TODO: Start triage/approval workflow
      break;

    case 'ASSET_STATUS_CHANGE':
      console.log('Asset status changed:', event.assetId);
      // TODO: Raise downtime alerts, update dashboards
      break;

    default:
      console.log(`Unhandled event type: ${event.eventType}`);
  }

  // Return 2xx quickly (MaintainX times out after 10 seconds)
  res.json({ received: true });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app and helper for testing
module.exports = app;
module.exports.verifyMaintainxSignature = verifyMaintainxSignature;

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/maintainx`);
  });
}
