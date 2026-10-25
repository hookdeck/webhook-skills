// Generated with: zigpoll-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Zigpoll signs every delivery with an X-Zigpoll-Signature header:
//   t=<unix milliseconds>,v1=<hex>
// v1 is HMAC-SHA256 (hex) of "<t>.<raw body>", keyed with the account-wide Signing Secret.
// https://docs.zigpoll.com/integrations/webhooks

// Optional replay window in seconds. Off by default (0): Hookdeck retries and replays resend the
// original timestamp (Zigpoll's own retries are re-signed with a fresh one), so a window would
// reject late redeliveries. Set ZIGPOLL_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to
// opt in; any other value is treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.ZIGPOLL_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`ZIGPOLL_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

// Split on ',' and trim each part. Every v1 is kept (Zigpoll sends one; accepting any match is harmless).
function parseSignatureHeader(header) {
  let t;
  const v1 = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === 't') t = value;
    else if (key === 'v1') v1.push(value);
  }
  return { t, v1 };
}

function verifyZigpoll(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;

  const { t, v1 } = parseSignatureHeader(signatureHeader);
  if (!t || v1.length === 0 || !/^\d+$/.test(t)) return false;

  // t is in milliseconds. The window is opt-in: off unless ZIGPOLL_TIMESTAMP_TOLERANCE_SECONDS > 0.
  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0 && Math.abs(Date.now() / 1000 - Number(t) / 1000) > tolerance) {
    return false;
  }

  const expected = Buffer.from(
    crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest('hex')
  );
  // Accept if any v1 matches. Check it is 64 hex chars first, then compare equal-length buffers.
  let ok = false;
  for (const candidate of v1) {
    if (!/^[0-9a-f]{64}$/i.test(candidate)) continue;
    if (crypto.timingSafeEqual(Buffer.from(candidate.toLowerCase()), expected)) ok = true;
  }
  return ok;
}

// Raw body is required: the signature covers the exact bytes Zigpoll sent.
// type: '*/*' reads the body whatever the Content-Type is, so verification never depends on it.
app.post('/webhooks/zigpoll', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.ZIGPOLL_WEBHOOK_SECRET;
  if (!secret) {
    console.error('ZIGPOLL_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyZigpoll(rawBody, req.headers['x-zigpoll-signature'], secret)) {
    console.error('Zigpoll webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // Delivery is at-least-once: dedupe on X-Zigpoll-Delivery-Id (same across every attempt).
  const deliveryId = req.headers['x-zigpoll-delivery-id'];

  switch (event.type) {
    case 'submitted-responses':
      // Fires on every submission, even if the respondent stops partway
      console.log(`Responses submitted for poll ${event.pollId} (complete: ${event.submissionsComplete}) [${deliveryId}]`);
      break;
    case 'completed-survey':
      // Fires once the respondent reaches the end of the survey
      console.log(`Survey completed for poll ${event.pollId} by participant ${event.participantId} [${deliveryId}]`);
      break;
    default:
      console.log(`Unhandled event: ${event.type}`);
  }

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Zigpoll webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyZigpoll };
