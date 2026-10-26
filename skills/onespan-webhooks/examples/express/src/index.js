// Generated with: onespan-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * OneSpan Sign does not sign payloads. The callback key you registered is sent as
 * `Authorization: Basic {callbackKey}`: the raw key, NOT base64(user:pass), so don't
 * decode it as HTTP Basic. Compare the complete header value, including the "Basic "
 * prefix, with ONESPAN_AUTHORIZATION.
 */
function verifyOneSpanRequest(headers, config = process.env) {
  const expected = config.ONESPAN_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers['authorization'];
  if (!received) return false;
  return safeEqual(received, expected);
}

function handleEvent(payload) {
  // The event type is the `name` field of the JSON body.
  switch (payload.name) {
    case 'PACKAGE_CREATE':
      console.log(`Package created: ${payload.packageId}`);
      // TODO: store OneSpan's package ID next to your own transaction ID
      break;

    case 'PACKAGE_ACTIVATE':
      console.log(`Package sent to signers: ${payload.packageId}`);
      break;

    case 'DOCUMENT_SIGNED':
      console.log(`Document ${payload.documentId} signed by ${payload.sessionUser} in ${payload.packageId}`);
      // TODO: record per-document progress
      break;

    case 'SIGNER_COMPLETE':
      console.log(`Signer ${payload.sessionUser} completed package ${payload.packageId}`);
      break;

    case 'PACKAGE_COMPLETE':
      console.log(`Package complete: ${payload.packageId}`);
      // TODO: queue a job that downloads the signed documents by packageId
      break;

    case 'PACKAGE_DECLINE':
      console.log(`Package ${payload.packageId} declined: ${payload.message}`);
      // TODO: decide the next step from the decline reason
      break;

    case 'EMAIL_BOUNCE':
      console.log(`Email bounced for ${payload.packageId}: ${payload.message}`);
      break;

    default:
      console.log(`Unhandled OneSpan event: ${payload.name}`);
  }
}

// Read the body raw so the request is authenticated before anything is parsed,
// whatever Content-Type OneSpan uses.
app.post('/webhooks/onespan', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyOneSpanRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Authorization header' });
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
    console.error('Error handling OneSpan webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyOneSpanRequest = verifyOneSpanRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/onespan`);
  });
}
