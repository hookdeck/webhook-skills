// Generated with: delivereasy-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify the X-Signature header: base64(HMAC-SHA256(apiKey, rawBody)).
 * @param {Buffer} rawBody - Raw request body bytes
 * @param {string} signature - X-Signature header value
 * @param {string} apiKey - Delivereasy API key (HMAC key, used as UTF-8)
 */
function verifyDelivereasy(rawBody, signature, apiKey) {
  if (!apiKey || typeof signature !== 'string') return false;
  // Exact 44-char padded standard base64, checked before any comparison
  if (!/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const expected = crypto.createHmac('sha256', apiKey).update(rawBody).digest('base64');
  // Both are 44 ASCII chars, so timingSafeEqual cannot throw
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// Raw body for any content type: the exact bytes are what is signed
app.post('/webhooks/delivereasy', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyDelivereasy(rawBody, req.get('x-signature'), process.env.DELIVEREASY_WEBHOOK_SECRET)) {
    console.error('Delivereasy signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  let booking;
  try {
    booking = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (!booking || typeof booking !== 'object' || Array.isArray(booking)) {
    return res.status(400).send('Invalid payload');
  }

  // The payload is the booking itself; there is no event name. Dispatch on status.
  // Delivery is at least once: deduplicate on booking.id.
  console.log(`Booking ${booking.id} (${booking.booking_identifier}) status: ${booking.status}`);
  // TODO: enqueue for async processing, keyed by booking.id and status

  res.status(200).send('OK');
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

module.exports = { app, verifyDelivereasy };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/delivereasy`);
  });
}
