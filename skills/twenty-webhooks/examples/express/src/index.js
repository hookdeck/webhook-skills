// Generated with: twenty-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const HEX_64 = /^[0-9a-fA-F]{64}$/;

/**
 * Verify a Twenty webhook: X-Twenty-Webhook-Signature is the bare hex
 * HMAC-SHA256 of the bytes "<X-Twenty-Webhook-Timestamp>:" + raw body, keyed
 * with the webhook secret (UTF-8, used as-is).
 *
 * Timestamp tolerance is opt-in: Hookdeck retries and replays resend the
 * original timestamp, so a window is off unless toleranceSeconds > 0.
 * The timestamp is Date.now(), Unix milliseconds.
 */
function verifyTwentySignature(rawBody, signature, timestamp, secret, toleranceSeconds = 0) {
  if (!signature || !timestamp || !secret) return false;

  // Validate format first (Buffer.from(x, 'hex') silently drops bad characters)
  if (!HEX_64.test(signature)) return false;

  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(Date.now() - Number(timestamp)) > toleranceSeconds * 1000) return false;
  }

  // Build the signed message as bytes: "<timestamp>:" + raw body (never a re-encoded string)
  const signedPayload = Buffer.concat([
    Buffer.from(timestamp, 'latin1'),
    Buffer.from(':', 'utf8'),
    rawBody,
  ]);
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest();

  // Hex is case-insensitive; compare equal-length buffers in constant time
  const received = Buffer.from(signature.toLowerCase(), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(expected, received);
}

// Twenty webhook endpoint - must use the raw body (any content type)
app.post('/webhooks/twenty',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const tolerance = Number(process.env.TWENTY_WEBHOOK_TOLERANCE_SECONDS) || 0;

    if (!verifyTwentySignature(
      rawBody,
      req.get('X-Twenty-Webhook-Signature'),
      req.get('X-Twenty-Webhook-Timestamp'),
      process.env.TWENTY_WEBHOOK_SECRET,
      tolerance
    )) {
      console.error('Twenty webhook verification failed');
      return res.sendStatus(401);
    }

    // Parse only after the signature check
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON payload');
    }

    // Twenty's sender uses `eventName`; its docs page shows `event`
    const eventName = (payload && (payload.eventName || payload.event)) || undefined;
    const record = (payload && (payload.record || payload.data)) || {};

    // Handle the event based on <object>.<created|updated|deleted>
    switch (eventName) {
      case 'person.created':
        console.log('Person created:', record.id);
        // TODO: Sync the new contact to your system
        break;

      case 'person.deleted':
        console.log('Person deleted:', record.id);
        // TODO: Remove or archive the contact
        break;

      case 'company.updated':
        console.log('Company updated:', record.id);
        // TODO: Refresh the company in your system
        break;

      case 'opportunity.updated':
        console.log('Opportunity updated:', record.id);
        // TODO: React to stage or amount changes
        break;

      case 'note.created':
        console.log('Note created:', record.id);
        // TODO: Attach the note to the related record
        break;

      default:
        // Any other object (custom objects included) and action: <object>.<action>
        console.log(`Unhandled event: ${eventName}`);
    }

    // Any 2xx acknowledges the delivery
    res.sendStatus(200);
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = app;

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/twenty`);
  });
}
