// Generated with: tiltify-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Standard base64, padded: 32 bytes -> 43 characters + '='.
const BASE64_SHA256 = /^[A-Za-z0-9+/]{43}=$/;
// ISO-8601 UTC, e.g. 2023-04-18T16:49:00.617031Z
const ISO_UTC = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/;

/**
 * Optional replay window in seconds. Off by default (unset or 0): Hookdeck
 * retries and replays resend the original headers, so a fixed window would
 * reject legitimate deliveries.
 */
function toleranceFromEnv() {
  const value = Number(process.env.TILTIFY_WEBHOOK_TOLERANCE_SECONDS);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Verify a Tiltify webhook signature.
 *
 * Header:         X-Tiltify-Signature: <base64 digest> (padded, no prefix)
 * Signed content: `${X-Tiltify-Timestamp}.` + raw body bytes
 * Algorithm:      HMAC-SHA256 keyed with the secret's UTF-8 bytes (not hex-decoded)
 */
function verifyTiltifySignature(
  rawBody,
  signatureHeader,
  timestampHeader,
  secret,
  toleranceSeconds = 0,
  nowMs = Date.now()
) {
  if (!signatureHeader) {
    return { valid: false, error: 'Missing X-Tiltify-Signature header' };
  }
  if (!timestampHeader) {
    return { valid: false, error: 'Missing X-Tiltify-Timestamp header' };
  }
  // Validate length and alphabet before decoding: Buffer.from(x, 'base64')
  // silently drops bad characters.
  if (!BASE64_SHA256.test(signatureHeader)) {
    return { valid: false, error: 'Malformed X-Tiltify-Signature header' };
  }

  if (toleranceSeconds > 0) {
    // Checked only when the opt-in tolerance is set.
    const match = ISO_UTC.exec(timestampHeader);
    if (!match) {
      return { valid: false, error: 'Malformed X-Tiltify-Timestamp header' };
    }
    const millis = (match[2] || '').slice(0, 3).padEnd(3, '0');
    const sentMs = Date.parse(`${match[1]}.${millis}Z`);
    if (!Number.isFinite(sentMs) || Math.abs(nowMs - sentMs) > toleranceSeconds * 1000) {
      return { valid: false, error: 'Timestamp outside tolerance' };
    }
  }

  // Build the signed message as bytes: header value as latin1, raw body untouched.
  const signedContent = Buffer.concat([
    Buffer.from(timestampHeader, 'latin1'),
    Buffer.from('.', 'utf8'),
    rawBody,
  ]);
  const expected = Buffer.from(
    crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(signedContent).digest('base64'),
    'ascii',
  );
  // Compare the base64 text, as Hookdeck does: decoding would also accept a
  // non-canonical last character (stray low bits) that maps to the same digest.
  const received = Buffer.from(signatureHeader, 'ascii');

  return crypto.timingSafeEqual(expected, received)
    ? { valid: true }
    : { valid: false, error: 'Invalid signature' };
}

function handleEvent(event) {
  const type = event.meta && event.meta.event_type;
  const eventId = event.meta && event.meta.id;
  switch (type) {
    case 'public:direct:donation_updated':
    case 'private:direct:donation_updated':
    case 'public:indirect:donation_updated':
    case 'private:indirect:donation_updated':
      // New, moderated or refunded donation. The same donation can arrive more
      // than once, so deduplicate on meta.id.
      console.log(`${type}: donation ${event.data && event.data.id} (event ${eventId})`);
      break;
    case 'public:direct:fact_updated':
    case 'private:direct:fact_updated':
    case 'public:indirect:fact_updated':
    case 'private:indirect:fact_updated':
      // A campaign, team campaign or fundraising event changed (e.g. amount_raised).
      console.log(`${type}: fact ${event.data && event.data.id} (event ${eventId})`);
      break;
    default:
      // Unknown or future types: log and acknowledge.
      console.log(`Unhandled Tiltify event type: ${type}`);
  }
}

// Tiltify webhook endpoint. express.raw with '*/*' keeps the exact bytes that
// were signed, whatever the content type.
app.post('/webhooks/tiltify', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.TILTIFY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('TILTIFY_WEBHOOK_SECRET is not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  const verification = verifyTiltifySignature(
    rawBody,
    req.get('x-tiltify-signature'),
    req.get('x-tiltify-timestamp'),
    secret,
    toleranceFromEnv()
  );
  if (!verification.valid) {
    console.error('Tiltify webhook verification failed:', verification.error);
    return res.status(401).json({ error: verification.error });
  }

  // Parse only after the signature check.
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  // In production: persist the event, return 2xx, then process asynchronously.
  // Tiltify deactivates an endpoint after 12 failed retries.
  handleEvent(event);

  return res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyTiltifySignature = verifyTiltifySignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/tiltify`);
  });
}
