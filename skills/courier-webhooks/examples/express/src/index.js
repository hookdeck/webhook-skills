// Generated with: courier-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Normalize the `t` value from courier-signature to milliseconds.
 *
 * Courier documents `t` as a millisecond timestamp. As a safeguard, a
 * ~10-digit value is treated as seconds and a ~13-digit value as
 * milliseconds. Only the staleness check needs this - the HMAC always covers
 * the `t` string exactly as received.
 *
 * @param {string} timestamp - The raw `t` value from the header
 * @returns {number} The timestamp in milliseconds, or NaN if not numeric
 */
function toMillis(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value)) return NaN;
  return Math.abs(value) < 1e11 ? value * 1000 : value;
}

/**
 * Verify a Courier outbound webhook signature.
 *
 * Courier signs each webhook with HMAC-SHA256. The `courier-signature` header
 * looks like `t=<timestamp>,signature=<hex_digest>`, and the signed content is
 * `<timestamp>.<rawBody>` (timestamp + "." + the raw request body).
 *
 * Courier's docs write the signed content as `${t}.${JSON.stringify(body)}`;
 * we use the raw body instead. The two are byte-identical for a delivery you
 * have not modified, and the raw body avoids re-serialization drift.
 *
 * @param {Buffer|string} rawBody - Raw request body (NOT parsed JSON)
 * @param {string} signatureHeader - The `courier-signature` header value
 * @param {string} secret - Your Courier webhook signing secret
 * @param {number} toleranceMs - Max allowed clock skew. Courier publishes no
 *   replay window; 5 minutes is our default, not a documented value.
 * @returns {boolean} Whether the signature is valid
 */
function verifyCourierWebhook(rawBody, signatureHeader, secret, toleranceMs = 5 * 60 * 1000) {
  if (!signatureHeader) return false;

  // Parse "t=<timestamp>,signature=<hex>"
  const parts = {};
  for (const segment of signatureHeader.split(',')) {
    const i = segment.indexOf('=');
    if (i !== -1) parts[segment.slice(0, i).trim()] = segment.slice(i + 1).trim();
  }
  const timestamp = parts.t;
  const signature = parts.signature;
  if (!timestamp || !signature) return false;

  // Reject stale deliveries (accepts a seconds or milliseconds timestamp)
  const ts = toMillis(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > toleranceMs) return false;

  // Recompute HMAC over "<timestamp>.<rawBody>"
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');

  // Timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false; // hex length mismatch = invalid
  }
}

// Courier webhook endpoint — must use raw body for signature verification
app.post(
  '/webhooks/courier',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['courier-signature'];

    // Verify the signature before trusting the payload
    if (!verifyCourierWebhook(req.body, signature, process.env.COURIER_WEBHOOK_SECRET)) {
      console.error('Courier webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse the payload only after verification
    const event = JSON.parse(req.body.toString('utf8'));
    const { type, data } = event;

    // Handle the event based on its type (envelope: { type, data })
    switch (type) {
      case 'message:updated':
        // Courier does NOT emit per-status events — status lives in `data`.
        // Statuses: ENQUEUED, SENT, DELIVERED, OPENED, CLICKED, UNROUTABLE,
        // UNDELIVERABLE. Keep a fallback for values you don't recognize.
        console.log(`Message updated: ${data?.id} status=${data?.status}`);
        // Your code: Sync delivery status, retry, analytics, etc.
        break;

      case 'notification:submitted':
        console.log('Notification submitted:', data?.id);
        // Your code: Record send in flight, audit trail, etc.
        break;

      case 'notification:submission_canceled':
        console.log('Notification submission canceled:', data?.id);
        // Your code: Reconcile canceled send, etc.
        break;

      case 'notification:published':
        console.log('Notification published:', data?.id);
        // Your code: Invalidate template cache, sync versions, etc.
        break;

      case 'audiences:updated':
        console.log('Audience updated:', data?.id);
        // Your code: Sync segment definition, etc.
        break;

      case 'audiences:user:matched':
        console.log('User matched audience:', data?.audience_id, data?.user_id);
        // Your code: Trigger onboarding, tag user, etc.
        break;

      case 'audiences:user:unmatched':
        console.log('User unmatched audience:', data?.audience_id, data?.user_id);
        // Your code: Revoke access, update CRM, etc.
        break;

      case 'audiences:calculated':
        console.log('Audience calculated:', data?.audience_id);
        // Your code: Kick off downstream jobs, etc.
        break;

      default:
        console.log(`Unhandled event type: ${type}`);
    }

    // Return 200 quickly to acknowledge receipt; do heavy work async
    res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyCourierWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/courier`);
  });
}
