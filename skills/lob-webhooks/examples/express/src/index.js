// Generated with: lob-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

const HEX_DIGEST = /^[0-9a-fA-F]{64}$/;

/**
 * Lob sends no webhook SDK, so we verify manually.
 *
 * Lob-Signature = lowercase hex HMAC-SHA256(secret, `${Lob-Signature-Timestamp}.${raw body}`)
 * The signed message is built as BYTES: the timestamp header exactly as received (latin1),
 * a literal ".", then the raw body bytes. Never decode and re-encode the body.
 */
function verifyLobSignature(rawBody, headers, secret) {
  const signature = headers['lob-signature'];
  const timestamp = headers['lob-signature-timestamp'];
  if (!secret || !signature || !timestamp) return false;

  // Validate the format before decoding: Buffer.from(x, 'hex') silently drops bad characters.
  if (!HEX_DIGEST.test(signature)) return false;

  const message = Buffer.concat([
    Buffer.from(timestamp, 'latin1'),
    Buffer.from('.', 'utf8'),
    rawBody,
  ]);
  const expected = crypto.createHmac('sha256', secret).update(message).digest();
  // Hex is case-insensitive: decode both sides to bytes, then compare in constant time.
  const received = Buffer.from(signature.toLowerCase(), 'hex');
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

/**
 * Optional replay protection (Lob's step 4). Off unless LOB_WEBHOOK_TOLERANCE_SECONDS > 0.
 * Hookdeck retries and replays re-send the ORIGINAL timestamp, so a fixed window would reject
 * legitimate retries - leave it off when Lob delivers through Hookdeck.
 * Lob does not document the timestamp unit, so a ~10-digit value is read as seconds and a
 * ~13-digit value as milliseconds.
 */
function isTimestampFresh(timestamp, toleranceSeconds) {
  if (!(toleranceSeconds > 0)) return true;
  const value = Number(timestamp);
  if (!Number.isFinite(value)) return false;
  const timestampMs = Math.abs(value) < 1e11 ? value * 1000 : value;
  return Math.abs(Date.now() - timestampMs) <= toleranceSeconds * 1000;
}

// Lob webhook endpoint (Lob sends POST). Must use the RAW body for verification:
// express.raw({ type: '*/*' }) keeps the exact bytes whatever the content type.
app.post('/webhooks/lob', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.LOB_WEBHOOK_SECRET;
  if (!secret) {
    console.error('LOB_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyLobSignature(rawBody, req.headers, secret)) {
    return res.status(401).send('Invalid signature');
  }

  const tolerance = Number(process.env.LOB_WEBHOOK_TOLERANCE_SECONDS || 0);
  if (!isTimestampFresh(req.headers['lob-signature-timestamp'], tolerance)) {
    return res.status(401).send('Timestamp outside tolerance');
  }

  // Signature verified - safe to parse.
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // The event type is event_type.id; the mailpiece/resource is in event.body.
  const eventType = event.event_type && event.event_type.id;
  const resource = event.body || {};

  // TODO: use event.id to deduplicate (Lob retries until it sees a 2xx).
  switch (eventType) {
    case 'postcard.created':
      console.log(`Postcard created: ${resource.id}`);
      break;

    case 'postcard.delivered':
      console.log(`Postcard delivered: ${resource.id}`);
      // TODO: trigger the downstream "mail delivered" workflow.
      break;

    case 'postcard.re-routed':
      console.log(`Postcard re-routed: ${resource.id}`);
      break;

    case 'letter.mailed':
      console.log(`Letter mailed: ${resource.id}`);
      break;

    case 'letter.delivered':
      console.log(`Letter delivered: ${resource.id}`);
      break;

    case 'check.in_transit':
      console.log(`Check in transit: ${resource.id}`);
      break;

    case 'self_mailer.rendered_thumbnails':
      console.log(`Self mailer thumbnails rendered: ${resource.id}`);
      // TODO: download resource.thumbnails (small/medium/large URLs) if payload redaction is off.
      break;

    default:
      console.log(`Unhandled event type: ${eventType}`);
  }

  // Return 2xx quickly: anything else makes Lob retry (8 attempts over ~27.5 hours).
  res.json({ received: true });
});

// Health check endpoint.
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing.
module.exports = app;

// Start the server only when run directly (not when imported for testing).
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/lob`);
  });
}
