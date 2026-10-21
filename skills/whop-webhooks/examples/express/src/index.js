require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set WHOP_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.WHOP_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`WHOP_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

/**
 * Verify a Whop delivery (Standard Webhooks) and return the parsed body. Throws if it's invalid.
 *
 * Written out rather than calling the SDK's unwrapWebhook(), because that always enforces a
 * 5-minute timestamp window. Hookdeck retries and replays carry the original
 * webhook-timestamp, so that window would reject them. Here the window is opt-in via
 * WHOP_TIMESTAMP_TOLERANCE_SECONDS.
 */
function verifyWhopWebhook(rawBody, headers, secret, toleranceSeconds = timestampToleranceSeconds()) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatureHeader = headers['webhook-signature'];
  if (!id || !timestamp || !signatureHeader) throw new Error('Missing webhook-* signature headers');
  if (!/^\d+$/.test(timestamp)) throw new Error('Invalid webhook-timestamp');
  if (toleranceSeconds > 0 && Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > toleranceSeconds) {
    throw new Error('Timestamp outside tolerance');
  }

  // The key is the literal UTF-8 bytes of the ws_ secret: don't strip ws_ or base64-decode it
  const expected = crypto.createHmac('sha256', secret).update(`${id}.${timestamp}.`).update(rawBody).digest();

  // webhook-signature is a space-delimited list of "v1,<base64>" entries; any match is valid
  const match = signatureHeader.split(' ').some((entry) => {
    const [version, signature] = entry.split(',');
    if (version !== 'v1' || !signature) return false;
    const given = Buffer.from(signature, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
  if (!match) throw new Error('No matching signature');
  return JSON.parse(rawBody);
}

// Whop signs "{webhook-id}.{webhook-timestamp}.{raw body}", so the route needs the
// raw bytes. express.raw() must run before any JSON parser on this route.
app.post('/webhooks/whop', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.WHOP_WEBHOOK_SECRET;
  if (!secret) {
    console.error('WHOP_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  let event;
  try {
    // Verifies the Standard Webhooks signature (HMAC-SHA256, v1,<base64>), then returns the
    // parsed body. The secret is used exactly as Whop issued it (ws_...). The timestamp
    // window is opt-in (WHOP_TIMESTAMP_TOLERANCE_SECONDS).
    event = verifyWhopWebhook(req.body.toString('utf8'), req.headers, secret);
  } catch (err) {
    console.error('Whop signature verification failed:', err.message);
    return res.status(400).send('Invalid signature');
  }

  // Retries reuse the same webhook-id: store it and skip duplicates in production.
  switch (event.type) {
    case 'payment.succeeded':
      console.log('Payment succeeded:', event.data.id);
      break;
    case 'payment.failed':
      console.log('Payment failed:', event.data.id);
      break;
    case 'membership.activated':
      console.log('Membership activated:', event.data.id);
      break;
    case 'membership.deactivated':
      console.log('Membership deactivated:', event.data.id);
      break;
    case 'refund.created':
      console.log('Refund created:', event.data.id);
      break;
    default:
      console.log('Unhandled event type:', event.type);
  }

  // Respond 2xx within 5 seconds or Whop retries.
  res.status(200).json({ received: true });
});

module.exports = app;

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Whop webhook server listening on port ${port}`));
}
