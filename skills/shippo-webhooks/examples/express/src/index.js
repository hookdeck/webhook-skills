// Generated with: shippo-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set SHIPPO_TIMESTAMP_TOLERANCE_SECONDS to a positive value to opt in.
// A value that isn't a whole number of seconds is treated as 0 (check off), with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.SHIPPO_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`SHIPPO_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

/**
 * Verify the Shippo-Auth-Signature header.
 * Format: "t=<unix timestamp>,v1=<hex HMAC-SHA256>"
 * Signed content: "<t>.<raw body>", keyed with the HMAC secret Shippo provisioned.
 */
function verifyShippoSignature(rawBody, header, secret) {
  const parts = header.split(',').map((part) => {
    const i = part.indexOf('=');
    return i === -1 ? [part.trim(), ''] : [part.slice(0, i).trim(), part.slice(i + 1).trim()];
  });
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value);

  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) {
    return { valid: false, error: 'Malformed Shippo-Auth-Signature header' };
  }

  // Optional replay protection (off unless SHIPPO_TIMESTAMP_TOLERANCE_SECONDS > 0)
  const tolerance = timestampToleranceSeconds();
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (tolerance > 0 && age > tolerance) {
    return { valid: false, error: 'Timestamp outside tolerance' };
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');

  const match = signatures.some((sig) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expected, 'utf8'));
    } catch {
      return false; // Different lengths = invalid
    }
  });

  return match ? { valid: true } : { valid: false, error: 'Invalid signature' };
}

/**
 * Verify the self-generated token appended to the webhook URL (?token=...).
 * Used when HMAC hasn't been provisioned for the account.
 */
function verifyUrlToken(received, expected) {
  if (typeof received !== 'string') return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
  } catch {
    return false;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Shippo webhook endpoint
// IMPORTANT: express.raw() keeps the exact bytes Shippo signed.
app.post('/webhooks/shippo',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.SHIPPO_WEBHOOK_SECRET;
    const token = process.env.SHIPPO_WEBHOOK_TOKEN;

    if (!secret && !token) {
      console.error('Set SHIPPO_WEBHOOK_SECRET (HMAC) and/or SHIPPO_WEBHOOK_TOKEN (URL token)');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');

    // URL token check (fallback when HMAC isn't enabled; can be combined with HMAC)
    if (token && !verifyUrlToken(req.query.token, token)) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    // HMAC check (only sent once Shippo has provisioned a secret for your account)
    if (secret) {
      const signatureHeader = req.headers['shippo-auth-signature'];
      if (!signatureHeader) {
        return res.status(400).json({ error: 'Missing Shippo-Auth-Signature header' });
      }
      const result = verifyShippoSignature(rawBody, signatureHeader, secret);
      if (!result.valid) {
        console.error('Shippo signature verification failed:', result.error);
        return res.status(400).json({ error: result.error });
      }
    }

    // Parse only after verification
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    const { event, data, test } = payload;
    console.log(`Received Shippo webhook: ${event}${test ? ' (test)' : ''}`);

    // Respond within 3 seconds; move slow work to a queue.
    // Shippo sends no event ID, so dedupe on natural keys (see webhook-handler-patterns).
    switch (event) {
      case 'track_updated':
        console.log('Tracking updated:', data?.tracking_number, data?.tracking_status?.status);
        // TODO: update order status, notify customer on DELIVERED / FAILURE
        break;
      case 'transaction_created':
        console.log('Transaction created:', data?.object_id, data?.tracking_number);
        // TODO: store label_url and tracking number
        break;
      case 'transaction_updated':
        console.log('Transaction updated:', data?.object_id, data?.status);
        // TODO: sync label/transaction state
        break;
      case 'batch_created':
        console.log('Batch created:', data);
        // TODO: review and purchase the batch
        break;
      case 'batch_purchased':
        console.log('Batch purchased:', data);
        // TODO: download merged label PDFs
        break;
      case 'automations_label_resolved':
        console.log('Automations label resolved:', data?.request_id, data?.status);
        // TODO: dedupe on request_id; fulfil or alert on failure
        break;
      default:
        console.log('Unhandled Shippo event:', event);
    }

    return res.status(200).json({ received: true, event });
  }
);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Shippo webhook server running on port ${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/shippo`);
  });
}

module.exports = { app, verifyShippoSignature };
