require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Chili Piper webhook signature.
 *
 * Chili Piper sends `X-Chili-Signature` = lowercase hex HMAC-SHA256 of
 * `{X-Chili-Timestamp}.{raw body}`, keyed with the tenant's signing secret
 * (UTF-8 bytes, used as-is).
 *
 * @param {Buffer} rawBody - Raw request body bytes
 * @param {string|undefined} signature - `X-Chili-Signature` header value
 * @param {string|undefined} timestamp - `X-Chili-Timestamp` header value
 * @param {string|undefined} secret - Webhook signing secret
 * @returns {boolean} - Whether the signature is valid
 */
function verifyChiliPiperSignature(rawBody, signature, timestamp, secret) {
  if (!signature || !timestamp || !secret) {
    return false;
  }

  // Validate the format before decoding: Buffer.from(x, 'hex') silently
  // drops invalid characters.
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) {
    return false;
  }

  // Signed message built as bytes: timestamp header (latin1) + "." + raw body
  const signed = Buffer.concat([
    Buffer.from(timestamp, 'latin1'),
    Buffer.from('.'),
    rawBody,
  ]);
  const expected = crypto.createHmac('sha256', secret).update(signed).digest();

  // Both are 32 bytes, so timingSafeEqual cannot throw on length
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), expected);
}

/**
 * Optional replay check on `X-Chili-Timestamp` (Unix seconds).
 * A tolerance of 0 (default) disables the check.
 */
function isTimestampFresh(timestamp, toleranceSeconds, nowMs = Date.now()) {
  if (!toleranceSeconds || toleranceSeconds <= 0) {
    return true;
  }
  if (!/^\d+$/.test(timestamp)) {
    return false;
  }
  return Math.abs(nowMs / 1000 - Number(timestamp)) <= toleranceSeconds;
}

function handleChiliPiperEvent(payload) {
  // The body's `type` matches the webhook type: Created, Updated or Deleted
  switch (payload.type) {
    case 'Created':
      console.log(`Meeting ${payload.meetingIdChili} booked: ${payload.meetingTitle} at ${payload.meetingStartTime}`);
      // TODO: Create the meeting in your CRM or notify the host
      break;

    case 'Updated':
      console.log(`Meeting ${payload.meetingIdChili} updated: ${payload.meetingStartTime}, assignee ${payload.assigneeEmail}`);
      // TODO: Sync the new time or assignee
      break;

    case 'Deleted':
      console.log(`Meeting ${payload.meetingIdChili} canceled`);
      // TODO: Remove the meeting from your CRM
      break;

    default:
      console.log(`Unhandled Chili Piper event type: ${payload.type}`);
  }
}

// Chili Piper webhook endpoint - must use the raw body for signature verification
app.post('/webhooks/chili-piper',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.CHILI_PIPER_WEBHOOK_SECRET;
    if (!secret) {
      console.error('CHILI_PIPER_WEBHOOK_SECRET is not configured');
      return res.status(500).send('Webhook secret not configured');
    }

    const signature = req.headers['x-chili-signature'];
    const timestamp = req.headers['x-chili-timestamp'];
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

    if (!verifyChiliPiperSignature(rawBody, signature, timestamp, secret)) {
      console.error('Chili Piper webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    const tolerance = Number(process.env.CHILI_PIPER_WEBHOOK_TOLERANCE_SECONDS || 0);
    if (!isTimestampFresh(timestamp, tolerance)) {
      return res.status(401).send('Timestamp outside tolerance');
    }

    // Parse only after verification
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).send('Invalid payload');
    }

    // Retry behavior is not documented: de-duplicate on meetingIdChili + type
    handleChiliPiperEvent(payload);

    res.status(200).json({ received: true, type: payload.type });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyChiliPiperSignature, isTimestampFresh };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/chili-piper`);
  });
}
