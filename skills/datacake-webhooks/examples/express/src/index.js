// Generated with: datacake-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 * Header values are read as latin1 (how Node decodes them), the secret as utf8.
 */
function safeEqual(received, expected) {
  const ha = crypto.createHash('sha256').update(Buffer.from(received, 'latin1')).digest();
  const hb = crypto.createHash('sha256').update(Buffer.from(expected, 'utf8')).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Datacake does not sign payloads. You add a secret header under Headers on the webhook
 * (Authorization or any name you choose) and the receiver compares the WHOLE value, exactly
 * as typed in Datacake, including any "Bearer " prefix. Nothing is stripped or parsed.
 * Node lowercases incoming header names, so the lookup is case-insensitive.
 */
function verifyDatacakeRequest(
  headers,
  headerName = process.env.DATACAKE_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.DATACAKE_WEBHOOK_SECRET
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()];
  return typeof received === 'string' && received.length > 0 && safeEqual(received, secret);
}

function handleEvent(payload) {
  const { event, data } = payload;

  switch (event) {
    case 'device_measurement': {
      // data is an array of { field, value, device, timestamp } for the fields just recorded
      const rows = Array.isArray(data) ? data : [];
      console.log(`Device measurement: ${rows.length} value(s)`);
      // TODO: store each row in your database (row.device, row.field, row.value, row.timestamp)
      break;
    }

    case 'decoder_output': {
      // data.result is the raw payload decoder output; data.log and data.device may be null
      const results = Array.isArray(data && data.result) ? data.result : [];
      console.log(`Decoder output: ${results.length} result(s) for product ${data && data.product}`);
      // TODO: act on raw decoder data that isn't stored in the time-series database
      break;
    }

    case 'downlink': {
      // data.meta.type is e.g. "lorawan"; data.payload is the base64 downlink payload
      console.log(`Downlink sent to device ${data && data.device}`);
      // TODO: audit or mirror the downlink (data.meta, data.payload, data.product_slug)
      break;
    }

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/datacake', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyDatacakeRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook secret header' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Datacake event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyDatacakeRequest = verifyDatacakeRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/datacake`);
  });
}
