// Generated with: flagsmith-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Verify X-Flagsmith-Signature: hex HMAC-SHA256 of the raw body, keyed with the secret.
 * Flagsmith has no timestamp header, so there is no replay window to check.
 */
function verifyFlagsmithSignature(rawBody, signatureHeader, secret) {
  if (!rawBody || !signatureHeader || !secret) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  const received = Buffer.from(signatureHeader.trim().toLowerCase());
  const expectedBuf = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so guard first
  return received.length === expectedBuf.length && crypto.timingSafeEqual(received, expectedBuf);
}

// CRITICAL: read the raw body for any content type so the signed bytes are untouched
app.post('/webhooks/flagsmith', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.FLAGSMITH_WEBHOOK_SECRET;
  const rawBody = req.body;

  if (!secret) {
    console.error('FLAGSMITH_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const signature = req.headers['x-flagsmith-signature'];
  if (!signature) {
    return res.status(400).send('Missing X-Flagsmith-Signature header');
  }

  if (!Buffer.isBuffer(rawBody) || !verifyFlagsmithSignature(rawBody, signature, secret)) {
    console.error('Flagsmith signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // Environment and audit-log webhooks use { event_type, data }.
  // Identity webhooks have no event_type: they send { identity, flags, traits, segments }.
  switch (payload.event_type) {
    case 'FLAG_UPDATED':
      console.log('Flag updated:', payload.data?.new_state?.feature?.name);
      break;
    case 'FLAG_DELETED':
      console.log('Flag deleted:', payload.data?.feature?.name ?? payload.data?.new_state?.feature?.name);
      break;
    case 'AUDIT_LOG_CREATED':
      console.log('Audit log:', payload.data?.log);
      break;
    case undefined:
      if (payload.identity !== undefined) {
        console.log('Identity evaluation for:', payload.identity);
      } else {
        console.log('Unrecognized Flagsmith payload');
      }
      break;
    default:
      console.log('Unhandled Flagsmith event:', payload.event_type);
  }

  res.status(200).json({ received: true });
});

module.exports = { app, verifyFlagsmithSignature };

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Flagsmith webhook server listening on port ${port}`));
}
