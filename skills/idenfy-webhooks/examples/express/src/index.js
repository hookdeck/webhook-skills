// Generated with: idenfy-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * iDenfy sends Idenfy-Signature: bare lowercase hex HMAC-SHA256 of the raw request body,
 * keyed with the webhook's signing key used as a UTF-8 string (no prefix, no timestamp).
 * The 64-hex check comes first because Buffer.from(x, 'hex') silently truncates bad input.
 */
function verifyIdenfySignature(rawBody, signature, secret = process.env.IDENFY_WEBHOOK_SECRET) {
  if (!secret || typeof signature !== 'string') return false;
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

// The event name is in the Idenfy-Event-Type header, not the body.
function handleEvent(eventType, body) {
  switch (eventType) {
    case 'IDENTIFICATION_AUTO_FINISHED':
      console.log(`KYC auto review finished (scanRef ${body.scanRef}, final: ${body.final})`, body.status);
      // TODO: if body.final is false, wait for IDENTIFICATION_MANUAL_FINISHED
      break;

    case 'IDENTIFICATION_MANUAL_FINISHED':
      console.log(`KYC manual review finished (scanRef ${body.scanRef})`, body.status);
      // TODO: record the final approve/deny decision
      break;

    case 'IDENTIFICATION_EXPIRED':
      console.log(`KYC verification expired (scanRef ${body.scanRef})`);
      break;

    case 'IDENTIFICATION_CANCELLED':
      console.log(`KYC verification cancelled (scanRef ${body.scanRef})`);
      break;

    case 'COMPANY_REVIEW':
      console.log('KYB company review completed', body);
      break;

    case 'AML_MONITORING':
      console.log('AML monitoring result', body);
      break;

    default:
      console.log(`Unhandled event: ${eventType}`);
  }
}

// Read the body raw (any content type) so the signature covers the exact bytes received.
app.post('/webhooks/idenfy', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyIdenfySignature(rawBody, req.headers['idenfy-signature'])) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(req.headers['idenfy-event-type'], body);
  } catch (err) {
    console.error('Error handling iDenfy event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyIdenfySignature = verifyIdenfySignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/idenfy`);
  });
}
