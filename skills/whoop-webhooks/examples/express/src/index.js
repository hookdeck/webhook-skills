// Generated with: whoop-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// X-WHOOP-Signature is the 44-character padded base64 of a 32-byte digest
const SIG_RE = /^[A-Za-z0-9+/]{43}=$/;

/**
 * Verify a WHOOP webhook signature.
 *
 * base64(HMAC-SHA256(client_secret, X-WHOOP-Signature-Timestamp + raw body)),
 * with no separator between the timestamp and the body.
 *
 * @param {Buffer} rawBody - Raw request body bytes
 * @param {string} signature - X-WHOOP-Signature header value
 * @param {string} timestamp - X-WHOOP-Signature-Timestamp header value (Unix ms)
 * @param {string} secret - WHOOP app client secret
 * @returns {boolean}
 */
function verifyWhoopSignature(rawBody, signature, timestamp, secret) {
  if (!signature || !timestamp || !secret || !SIG_RE.test(signature)) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(timestamp, 'latin1'), rawBody]))
    .digest('base64');

  // Both are 44 ASCII characters here, so the lengths always match
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'latin1'),
    Buffer.from(expected, 'latin1')
  );
}

/**
 * Optional replay protection. Off unless a positive tolerance is configured,
 * because Hookdeck retries and replays resend the original timestamp.
 * The timestamp is Unix MILLISECONDS.
 */
function isTimestampFresh(timestamp, toleranceSeconds, now = Date.now()) {
  if (!toleranceSeconds || toleranceSeconds <= 0) {
    return true;
  }
  if (!/^\d+$/.test(timestamp)) {
    return false;
  }
  return Math.abs(now - Number(timestamp)) <= toleranceSeconds * 1000;
}

app.post('/webhooks/whoop',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['x-whoop-signature'];
    const timestamp = req.headers['x-whoop-signature-timestamp'];
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

    // Verify the signature before trusting the payload
    if (!verifyWhoopSignature(rawBody, signature, timestamp, process.env.WHOOP_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    if (!isTimestampFresh(timestamp, Number(process.env.WHOOP_WEBHOOK_TOLERANCE_SECONDS))) {
      console.error('Webhook timestamp outside tolerance');
      return res.status(401).send('Timestamp outside tolerance');
    }

    // Parse only after verification
    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }
    if (event === null || typeof event !== 'object') {
      return res.status(400).send('Invalid payload');
    }

    const { type, id, user_id, trace_id } = event;
    console.log(`Received ${type} for user ${user_id} (id ${id}, trace ${trace_id})`);

    // Payloads are thin: fetch the record from the v2 API using `id`.
    // For recovery.* events, `id` is the UUID of the associated sleep.
    switch (type) {
      case 'sleep.updated':
        // TODO: GET /v2/activity/sleep/{id}
        console.log(`Sleep ${id} created or updated`);
        break;

      case 'workout.updated':
        // TODO: GET /v2/activity/workout/{id}
        console.log(`Workout ${id} created or updated`);
        break;

      case 'recovery.updated':
        // TODO: fetch the recovery for sleep {id}
        console.log(`Recovery for sleep ${id} created or updated`);
        break;

      default:
        // sleep.deleted, workout.deleted, recovery.deleted and anything new
        console.log(`Unhandled event type: ${type}`);
    }

    return res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyWhoopSignature, isTimestampFresh };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/whoop`);
  });
}
