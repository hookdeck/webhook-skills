// Generated with: qonto-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const HEX64 = /^[0-9a-fA-F]{64}$/;

/**
 * Verify X-Qonto-Signature: `t=<unix seconds>,v1=<hex>`.
 * MAC = HMAC-SHA256(key = secret as UTF-8 bytes, message = `<t>.<raw body bytes>`), lowercase hex.
 * The secret may start with `whsec_` but is NOT a Standard Webhooks secret:
 * the whole string is the key (nothing stripped, nothing base64-decoded).
 */
function verifyQontoSignature(rawBody, header, secret, toleranceSeconds = 0) {
  if (!header) return { valid: false, error: 'Missing X-Qonto-Signature header' };

  let t = null;
  const candidates = [];
  for (const part of String(header).split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === 't' && t === null) t = value;
    else if (key === 'v1') candidates.push(value); // other keys (e.g. v0) are ignored
  }
  if (!t) return { valid: false, error: 'Missing t= in signature header' };
  if (candidates.length === 0) return { valid: false, error: 'Missing v1= in signature header' };

  if (toleranceSeconds > 0) {
    const ts = /^\d+$/.test(t) ? Number(t) : NaN;
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSeconds) {
      return { valid: false, error: 'Timestamp outside tolerance' };
    }
  }

  // Signed message is bytes: t exactly as it appears in the header, ".", raw body bytes.
  const expected = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(Buffer.concat([Buffer.from(`${t}.`, 'utf8'), rawBody]))
    .digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');

  // Validate length and alphabet before comparing; hex is case-insensitive.
  const wellFormed = candidates.filter((c) => HEX64.test(c));
  if (wellFormed.length === 0) return { valid: false, error: 'Malformed v1 signature' };

  const ok = wellFormed.some((c) => {
    const candBuf = Buffer.from(c.toLowerCase(), 'utf8');
    return candBuf.length === expectedBuf.length && crypto.timingSafeEqual(candBuf, expectedBuf);
  });
  return ok ? { valid: true } : { valid: false, error: 'Signature mismatch' };
}

// Dispatch on the top-level `type` (subscription type); `data.event` says what happened.
function handleQontoEvent(event) {
  const what = event.data && event.data.event;
  switch (event.type) {
    case 'v1/transactions':
      console.log(`Transaction ${what}: ${event.data.id} (${event.data.amount} ${event.data.currency}, ${event.data.status})`);
      break;
    case 'v1/cards':
      console.log(`Card ${what}: ${event.data.id} (${event.data.status})`);
      break;
    case 'v1/transfers':
      console.log(`Transfer ${what}: ${event.data.id} (${event.data.amount_currency} ${event.data.amount}, ${event.data.status})`);
      break;
    default:
      console.log(`Unhandled Qonto event: ${event.type} ${what || ''}`.trim());
  }
}

// Raw bytes for any content type; parse only after the signature is verified.
app.post('/webhooks/qonto', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.QONTO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('QONTO_WEBHOOK_SECRET is not set; rejecting webhook');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const tolerance = parseInt(process.env.QONTO_WEBHOOK_TOLERANCE_SECONDS || '0', 10) || 0;
  const result = verifyQontoSignature(rawBody, req.get('x-qonto-signature'), secret, tolerance);
  if (!result.valid) {
    console.error('Qonto webhook verification failed:', result.error);
    return res.status(401).send(`Webhook Error: ${result.error}`);
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    return res.status(400).send('Invalid JSON payload');
  }

  // Qonto expects a 2xx within 1 second: acknowledge first, process after.
  res.status(200).json({ received: true });
  setImmediate(() => {
    try {
      handleQontoEvent(event);
    } catch (err) {
      console.error('Error processing Qonto event:', err);
    }
  });
});

module.exports = { app, verifyQontoSignature, handleQontoEvent };

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Qonto webhook server listening on http://localhost:${port}/webhooks/qonto`);
  });
}
