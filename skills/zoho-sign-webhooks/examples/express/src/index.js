// Generated with: zoho-sign-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Zoho Sign webhook.
 *
 * X-ZS-WEBHOOK-SIGNATURE = base64(HMAC-SHA256(key = secret as UTF-8, message = raw body)).
 * (Zoho's docs write "HMAC SHA-256(payload+secret_key)", but the secret is the HMAC key and
 * is NOT appended to the payload.) No timestamp is signed.
 *
 * @param {Buffer|string} rawBody - RAW request body, never re-serialised JSON
 * @param {string|undefined} signatureHeader - X-ZS-WEBHOOK-SIGNATURE value
 * @param {string|undefined} secret - ZOHO_SIGN_WEBHOOK_SECRET
 * @returns {boolean}
 */
function verifyZohoSignSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(signatureHeader);

  // timingSafeEqual throws on length mismatch, so compare lengths first
  return expectedBuf.length === receivedBuf.length && crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

// Read the body as raw bytes for ANY content type, so the signature can be verified
// before anything is parsed.
app.post('/webhooks/zoho-sign', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.ZOHO_SIGN_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed: never process unverified webhooks
    console.error('ZOHO_SIGN_WEBHOOK_SECRET is not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const signature = req.get('x-zs-webhook-signature');
  if (!signature) {
    return res.status(400).json({ error: 'Missing X-ZS-WEBHOOK-SIGNATURE header' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
  if (!verifyZohoSignSignature(rawBody, signature, secret)) {
    console.error('Zoho Sign signature verification failed');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const notification = payload.notifications || {};
  const request = payload.requests || {};
  const eventType = notification.operation_type;

  switch (eventType) {
    case 'RequestSubmitted':
      console.log(`Request submitted: ${request.request_name} (${request.request_id})`);
      break;
    case 'RequestViewed':
      console.log(`Request viewed by ${notification.performed_by_email}`);
      break;
    case 'RequestSigningSuccess':
      console.log(`Signed by ${notification.performed_by_email} (action ${notification.action_id})`);
      break;
    case 'RequestCompleted':
      console.log(`Request completed: ${request.request_name} (${request.request_id})`);
      break;
    case 'RequestRejected':
      console.log(`Request rejected: ${notification.reason || 'no reason given'}`);
      break;
    case 'RequestRecalled':
      console.log(`Request recalled: ${request.request_id}`);
      break;
    case 'RequestForwarded':
      console.log(`Request forwarded by ${notification.performed_by_email}`);
      break;
    case 'RequestExpired':
      console.log(`Request expired: ${request.request_id}`);
      break;
    default:
      console.log(`Unhandled event type: ${eventType}`);
  }

  // There is no event ID, so key idempotency on request, event, action and time
  // (see references/overview.md).
  res.json({ received: true });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Zoho Sign webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/zoho-sign`);
  });
}

module.exports = { app, verifyZohoSignSignature };
