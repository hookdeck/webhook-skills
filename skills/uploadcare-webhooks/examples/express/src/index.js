// Generated with: uploadcare-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Verify X-Uc-Signature: "v1=" + lowercase hex HMAC-SHA256(signing secret, raw body).
 * Only the body is signed (no timestamp), so there is no replay window to check.
 */
function verifyUploadcareSignature(rawBody, header, secret = process.env.UPLOADCARE_WEBHOOK_SECRET) {
  if (!secret || typeof header !== 'string') return false;
  let sig = header.trim();
  if (sig.toLowerCase().startsWith('v1=')) sig = sig.slice(3); // a bare digest is also accepted
  sig = sig.toLowerCase();
  // Validate before decoding: Buffer.from(x, 'hex') silently drops bad characters.
  if (!/^[0-9a-f]{64}$/.test(sig)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(sig, 'hex'));
}

function handleEvent(payload) {
  const event = payload && payload.hook && payload.hook.event;

  switch (event) {
    case 'file.uploaded':
      console.log(`File uploaded: ${payload.data && payload.data.uuid}`);
      // TODO: save a record for payload.data / payload.file (CDN URL)
      break;

    case 'file.stored':
      console.log(`File stored: ${payload.data && payload.data.uuid}`);
      // TODO: mark the upload as permanent
      break;

    case 'file.info_updated':
      console.log(`File info updated: ${payload.data && payload.data.uuid}`);
      // TODO: sync payload.data.metadata / appdata (v0.7); see payload.previous_values
      break;

    case 'file.infected':
      console.log(`File infected: ${payload.data && payload.data.uuid}`);
      // TODO: quarantine or delete the file
      break;

    case 'file.deleted':
      console.log(`File deleted: ${payload.data && payload.data.uuid}`);
      // TODO: remove your matching record
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

// Read the body raw (any content type) so the exact bytes are verified before parsing.
app.post('/webhooks/uploadcare', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyUploadcareSignature(rawBody, req.headers['x-uc-signature'])) {
    return res.status(401).json({ error: 'Invalid or missing signature' });
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
    console.error('Error handling Uploadcare event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyUploadcareSignature = verifyUploadcareSignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/uploadcare`);
  });
}
