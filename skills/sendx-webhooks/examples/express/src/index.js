// Generated with: sendx-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// SendX puts an INTEGER code in the body's top-level `type` (one code per sending surface)
const SENDX_EVENTS = {
  74: 'ContactCreated',
  73: 'GlobalUnsubscribe',
  7: 'MailOpen', 32: 'DripStepMailOpen', 172: 'RssExecMailOpen', 189: 'WorkflowEmailMailOpen', 271: 'SeedContactMailOpen',
  8: 'LinkClick', 33: 'DripStepLinkClick', 173: 'RssExecLinkClick', 190: 'WorkflowEmailLinkClick', 272: 'SeedContactLinkClick',
  5: 'MailBounced', 63: 'DripStepMailBounced', 180: 'RssExecMailBounced', 197: 'WorkflowEmailMailBounced', 276: 'SeedContactMailBounced',
  6: 'MailSpam', 62: 'DripStepMailSpam', 179: 'RssExecMailSpam', 196: 'WorkflowEmailMailSpam', 275: 'SeedContactMailSpam',
  60: 'MailDropped', 61: 'DripStepMailDropped', 178: 'RssExecMailDropped', 195: 'WorkflowEmailMailDropped', 278: 'SeedContactMailDropped',
};

/**
 * Verify a SendX webhook signature.
 *
 * SendX sends `X-SendX-Signature: <hex>`, the bare lowercase hex HMAC-SHA256 of the raw request
 * body, keyed with the team API key (UTF-8 bytes, used as-is). No timestamp is signed.
 */
function verifySendxSignature(rawBody, signatureHeader, secret) {
  if (typeof signatureHeader !== 'string') return false;
  // Check the hex shape first: Buffer.from(x, 'hex') silently drops invalid characters
  if (!/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signatureHeader.toLowerCase(), 'hex'), expected);
}

/** Return the integer `type` code, or null if the body has none (the field is untrusted). */
function getEventType(payload) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const { type } = payload;
  if (typeof type === 'number' && Number.isInteger(type)) return type;
  if (typeof type === 'string' && /^\d+$/.test(type)) return Number(type);
  return null;
}

// Read the raw body for ANY content type so the exact bytes are verified before parsing.
app.post('/webhooks/sendx', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.SENDX_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SENDX_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifySendxSignature(rawBody, req.headers['x-sendx-signature'], secret)) {
    console.error('SendX webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return res.status(400).send('Body must be a JSON object');
  }

  const type = getEventType(payload);
  const name = type === null ? undefined : SENDX_EVENTS[type];
  // X-SendX-Webhook-Id identifies a delivery; use it for idempotency since SendX retries
  const deliveryId = req.headers['x-sendx-webhook-id'];

  if (name) {
    console.log(`SendX event ${name} (type ${type}), delivery ${deliveryId ?? '(no id)'}`);
  } else {
    console.log(`Unhandled SendX event type: ${JSON.stringify(payload.type)}`);
  }

  res.json({ received: true });
});

const port = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(port, () => console.log(`SendX webhook server listening on port ${port}`));
}

module.exports = { app, verifySendxSignature, getEventType, SENDX_EVENTS };
