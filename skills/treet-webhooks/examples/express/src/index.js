// Generated with: treet-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Treet's docs don't name the HTTP method, so accept all the usual ones.
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

// Standard padded base64 of a 32-byte digest: 43 characters plus one "=".
const SIGNATURE_RE = /^[A-Za-z0-9+/]{43}=$/;

/**
 * X-Treet-Signature is base64(HMAC-SHA256(secret, raw body)), the whole header value.
 * The key is the secret's UTF-8 bytes; the message is the raw body bytes (no timestamp).
 */
function verifyTreetSignature(rawBody, signature, secret = process.env.TREET_WEBHOOK_SECRET) {
  if (!secret) return false; // never accept when unconfigured
  if (typeof signature !== 'string' || !SIGNATURE_RE.test(signature)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  // Both are 44 ASCII characters, so the buffers have equal length.
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function handleEvent(payload) {
  // `trigger` is the specific event; `topic` is the coarser topic ("label").
  switch (payload.trigger) {
    case 'label/created':
      console.log(`Shipping label created for bundle ${payload.bundleId}`, payload.trackingNumber);
      // TODO: store the carrier and tracking number
      break;

    case 'label/updated':
      console.log(`Shipping label updated for bundle ${payload.bundleId}: ${payload.status}`);
      // TODO: update the shipment status
      break;

    default:
      console.log(`Unhandled Treet trigger: ${String(payload.trigger)}`);
  }
}

// Read the body raw (any content type) so the exact bytes are verified before parsing.
app.all('/webhooks/treet', express.raw({ type: '*/*' }), (req, res) => {
  if (!process.env.TREET_WEBHOOK_SECRET) {
    console.error('Set TREET_WEBHOOK_SECRET');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  // A request with no body parses to {}, so fall back to zero bytes.
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  // Signature first, for every method.
  if (!verifyTreetSignature(rawBody, req.get('x-treet-signature'))) {
    return res.status(401).json({ error: 'Invalid or missing signature' });
  }

  if (!ALLOWED_METHODS.includes(req.method)) {
    res.set('Allow', ALLOWED_METHODS.join(', '));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // GET and DELETE (and some PUT/PATCH) carry no body: acknowledge them.
  if (rawBody.toString('utf8').trim() === '') {
    return res.status(200).json({ received: true });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Treet event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyTreetSignature = verifyTreetSignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/treet`);
  });
}
