// Generated with: khipu-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Khipu (notifications API 3.0) signs every delivery in x-khipu-signature: "t=<unix ms>,s=<base64>".
// s is standard padded base64 of HMAC-SHA256 over "<t>.<raw body>", keyed with the merchant secret.
// https://docs.khipu.com/en/payment-solutions/instant-payments/payment-webhook

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set KHIPU_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function toleranceSeconds() {
  const raw = (process.env.KHIPU_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`KHIPU_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
toleranceSeconds(); // surface an invalid value at startup

// "t=1711965600393,s=<base64>" -> { timestamp: '1711965600393', signatures: ['<base64>'] }
function parseSignatureHeader(header) {
  const parsed = { timestamp: undefined, signatures: [] };
  for (const item of header.split(',')) {
    const i = item.indexOf('=');
    if (i <= 0) continue;
    const key = item.slice(0, i).trim();
    const value = item.slice(i + 1).trim();
    if (key === 't' && parsed.timestamp === undefined) parsed.timestamp = value;
    else if (key === 's') parsed.signatures.push(value);
  }
  return parsed;
}

function verifyKhipu(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;

  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);
  if (!timestamp || signatures.length === 0) return false;

  // t is Unix milliseconds. Opt-in only: off unless KHIPU_WEBHOOK_TOLERANCE_SECONDS > 0.
  const tolerance = toleranceSeconds();
  if (tolerance > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(Date.now() - Number(timestamp)) > tolerance * 1000) return false;
  }

  // Signed message is bytes: the t string exactly as sent, ".", then the raw body.
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('base64');
  const expectedBuf = Buffer.from(expected);

  // Any s= entry may match (several can be present). Validate the format before comparing and
  // never decode it: Buffer.from(sig, 'base64') would silently drop bad characters.
  return signatures.some((sig) => {
    if (!/^[A-Za-z0-9+/]{43}=$/.test(sig)) return false;
    const sigBuf = Buffer.from(sig);
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
  });
}

// Raw body is required: the signature covers the exact bytes Khipu sent.
// type: '*/*' so any content type reaches the verifier as a Buffer.
app.post('/webhooks/khipu', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.KHIPU_WEBHOOK_SECRET;
  if (!secret) {
    console.error('KHIPU_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyKhipu(rawBody, req.headers['x-khipu-signature'], secret)) {
    console.error('Khipu webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  let payment;
  try {
    payment = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (payment === null || typeof payment !== 'object') {
    return res.status(400).send('Invalid payload');
  }

  // There is no event name: every verified POST is a reconciled payment.
  // Use payment_id for idempotency (see webhook-handler-patterns).
  console.log(
    `Payment ${payment.payment_id} reconciled: ${payment.amount} ${payment.currency}` +
      ` via ${payment.payment_method} (${payment.subject})`
  );

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Khipu webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyKhipu };
