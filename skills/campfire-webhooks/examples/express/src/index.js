// Generated with: campfire-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const HEX_DIGEST = /^[0-9a-fA-F]{64}$/;

/**
 * Verify a Campfire webhook delivery.
 *
 * Campfire signs the bytes `{Campfire-Webhook-Request-Timestamp}:{raw body}`
 * (a COLON, not a dot) with HMAC-SHA256, keyed with the webhook's signing
 * secret as UTF-8, and sends the bare lowercase hex digest (no prefix, despite
 * the `-v1` in the header name) in `Campfire-Webhook-Signature-v1`.
 *
 * The message is built as bytes: the timestamp header exactly as received
 * (latin1, never trimmed or parsed), the separator, then the untouched body.
 *
 * @param {Buffer} rawBody          Raw, unparsed request body
 * @param {object} headers          Node request headers (lowercase names)
 * @param {string} secret           Webhook signing secret (`token`)
 * @param {number} toleranceSeconds Optional max age; 0 (default) = no check
 * @returns {boolean}
 */
function verifyCampfireSignature(rawBody, headers, secret, toleranceSeconds = 0) {
  const timestamp = headers['campfire-webhook-request-timestamp'];
  const signature = headers['campfire-webhook-signature-v1'];
  if (!secret || !timestamp || !signature) return false;

  // Validate the format before decoding: Buffer.from(x, 'hex') silently drops
  // bad characters, which would turn garbage into a shorter "valid" buffer.
  if (!HEX_DIGEST.test(signature)) return false;

  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;
  }

  const message = Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from(':'), rawBody]);
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(message).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // validated above: 32 bytes

  return crypto.timingSafeEqual(expected, received);
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// express.raw with '*/*' keeps the exact bytes whatever the content type is.
// Do NOT use express.json() on this route: re-serialized JSON breaks the signature.
app.post('/webhooks/campfire', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const tolerance = Number(process.env.CAMPFIRE_WEBHOOK_TOLERANCE_SECONDS) || 0;

  if (!verifyCampfireSignature(rawBody, req.headers, process.env.CAMPFIRE_WEBHOOK_SECRET, tolerance)) {
    console.error('Campfire webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (event === null || typeof event !== 'object') {
    return res.status(400).send('Invalid payload');
  }

  // Campfire sends { webhook_uuid, topic, data, changes }. *.deleted topics
  // carry only { id } in data and null in changes.
  switch (event.topic) {
    case 'Invoice.created':
      console.log(`Invoice created: ${event.data?.id} (${event.data?.invoice_number})`);
      break;
    case 'Invoice.payment':
      // Fires on every increase in amount paid, including partial payments.
      console.log(`Invoice payment: ${event.data?.id}, amount paid ${event.data?.amount_paid}`);
      break;
    case 'Invoice.paid':
      // Fully paid. Campfire also sends Invoice.payment and no Invoice.updated.
      console.log(`Invoice paid: ${event.data?.id}`);
      break;
    case 'Bill.created':
      console.log(`Bill created: ${event.data?.id}`);
      break;
    case 'Bill.paid':
      console.log(`Bill paid: ${event.data?.id}`);
      break;
    case 'JournalEntry.created':
      console.log(`Journal entry created: ${event.data?.id}`);
      break;
    case 'Invoice.deleted':
    case 'Bill.deleted':
      console.log(`${event.topic}: ${event.data?.id}`);
      break;
    default:
      console.log(`Unhandled Campfire topic: ${event.topic}`);
  }

  // Deliveries are unordered and can repeat: treat data as the latest state of
  // the object, and acknowledge fast (2xx) before doing slow work.
  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Campfire webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/campfire`);
  });
}

module.exports = { app, verifyCampfireSignature };
