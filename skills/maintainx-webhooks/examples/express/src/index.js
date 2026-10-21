// Generated with: maintainx-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

const WEBHOOK_SECRET = process.env.MAINTAINX_WEBHOOK_SECRET;
// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set MAINTAINX_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.MAINTAINX_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`MAINTAINX_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

/**
 * Verify a MaintainX webhook signature.
 *
 * MaintainX sends `x-maintainx-webhook-body-signature: t=<unix>,v1=<hex>`.
 * v1 is HMAC-SHA256 (hex) over `{t}.{raw body}` keyed with the webhook secret.
 *
 * @param {Buffer|string} rawBody - the raw, unparsed request body
 * @param {string} header - the x-maintainx-webhook-body-signature header value
 * @param {string} secret - the webhook secret (raw string)
 * @param {number} toleranceSec - max allowed age of the timestamp; 0 turns the check off
 * @returns {boolean}
 */
function verifyMaintainxSignature(rawBody, header, secret, toleranceSec = timestampToleranceSeconds()) {
  if (!header || !secret) return false;

  // Parse "t=...,v1=..." into { t, v1 }
  const parts = Object.fromEntries(header.split(',').map((part) => part.split('=')));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  if (!/^\d+$/.test(timestamp)) return false;

  // MaintainX recommends a 5-minute window. It's opt-in here (toleranceSec > 0) because
  // retries and replays carry the original timestamp.
  const now = Math.floor(Date.now() / 1000);
  if (toleranceSec > 0 && Math.abs(now - Number(timestamp)) > toleranceSec) return false;

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
