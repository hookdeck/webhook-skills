// Generated with: ultravox-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const express = require('express');
require('dotenv').config({ quiet: true });

const app = express();

const HEX_DIGEST = /^[0-9a-fA-F]{64}$/;

/**
 * Verify an Ultravox webhook.
 *
 * Signature = lowercase hex HMAC-SHA256(secret, rawBody || X-Ultravox-Webhook-Timestamp),
 * with NO separator between the body bytes and the timestamp string.
 * Returns null when valid, otherwise a short reason string.
 */
function verifyUltravoxWebhook(rawBody, headers, secret, toleranceSeconds = 0) {
  const signature = headers['x-ultravox-webhook-signature'];
  const timestamp = headers['x-ultravox-webhook-timestamp'];
  if (!signature) return 'Missing X-Ultravox-Webhook-Signature header';
  if (!timestamp) return 'Missing X-Ultravox-Webhook-Timestamp header';

  // The whole header is one digest: exactly 64 hex characters, nothing else
  if (typeof signature !== 'string' || !HEX_DIGEST.test(signature)) {
    return 'Malformed signature';
  }

  // Signed message as bytes: raw body, then the timestamp header exactly as received (latin1)
  const signedContent = Buffer.concat([rawBody, Buffer.from(timestamp, 'latin1')]);
  const expected = crypto.createHmac('sha256', secret).update(signedContent).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // safe: format validated above

  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    return 'Invalid signature';
  }

  // Opt-in replay window. Off by default: Hookdeck retries/replays keep the original timestamp.
  if (toleranceSeconds > 0) {
    const sentAt = Date.parse(timestamp); // ISO 8601
    if (Number.isNaN(sentAt) || Math.abs(Date.now() - sentAt) > toleranceSeconds * 1000) {
      return 'Timestamp outside tolerance';
    }
  }
  return null;
}

// express.raw({ type: '*/*' }) keeps the exact bytes Ultravox signed, whatever the content type
app.post('/webhooks/ultravox', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.ULTRAVOX_WEBHOOK_SECRET;
  if (!secret) {
    console.error('ULTRAVOX_WEBHOOK_SECRET is not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const tolerance = Number(process.env.ULTRAVOX_WEBHOOK_TOLERANCE_SECONDS) || 0;
  const failure = verifyUltravoxWebhook(rawBody, req.headers, secret, tolerance);
  if (failure) {
    console.error('Ultravox webhook verification failed:', failure);
    return res.status(401).json({ error: failure });
  }

  // Verified - only now parse the body
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  switch (payload.event) {
    case 'call.started':
      console.log('Call started');
      // TODO: record the call as in progress
      break;
    case 'call.joined':
      console.log('Call joined');
      // TODO: the participant connected to the call
      break;
    case 'call.ended':
      console.log('Call ended');
      // TODO: fetch the transcript / final call details
      break;
    case 'call.billed':
      console.log('Call billed');
      // TODO: reconcile usage and cost
      break;
    default:
      console.log('Unhandled Ultravox event:', payload.event);
  }

  // Ultravox recommends 204; retries on 4xx/5xx and duplicates can occur, so handle idempotently
  res.status(204).end();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyUltravoxWebhook };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/ultravox`);
  });
}
