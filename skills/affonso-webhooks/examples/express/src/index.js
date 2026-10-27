// Generated with: affonso-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Affonso signs every webhook with two headers:
//   X-Affonso-Timestamp: Unix seconds
//   X-Affonso-Signature: lowercase hex HMAC-SHA256 of "<X-Affonso-Timestamp>.<raw body>", no prefix
// The key is the endpoint's 64-character hex signing secret used as a plain string (not hex-decoded).
// https://docs.affonso.io/webhooks/setup#verifying-webhook-signatures

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set AFFONSO_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function toleranceSeconds() {
  const raw = (process.env.AFFONSO_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`AFFONSO_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
toleranceSeconds(); // surface an invalid value at startup

function verifyAffonso(rawBody, timestampHeader, signatureHeader, secret) {
  if (!secret || !timestampHeader || !signatureHeader) return false;
  // Exactly 64 hex characters; check before decoding (Buffer.from(..., 'hex') drops bad characters)
  if (!/^[0-9a-fA-F]{64}$/.test(signatureHeader)) return false;

  // Affonso's docs show a 5 minute window. It's opt-in here: off unless the tolerance is > 0.
  const tolerance = toleranceSeconds();
  if (tolerance > 0) {
    if (!/^\d+$/.test(timestampHeader)) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestampHeader)) > tolerance) return false;
  }

  // Signed bytes: header value (latin1) + "." + the raw body bytes, never a decoded string
  const signed = Buffer.concat([
    Buffer.from(timestampHeader, 'latin1'),
    Buffer.from('.'),
    rawBody,
  ]);
  const expected = crypto.createHmac('sha256', secret).update(signed).digest();
  const received = Buffer.from(signatureHeader, 'hex'); // safe: validated above
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

// Raw body is required: the signature covers the exact bytes Affonso sent.
// type: '*/*' so any content type reaches the verifier as a Buffer.
app.post('/webhooks/affonso', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.AFFONSO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('AFFONSO_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyAffonso(rawBody, req.headers['x-affonso-timestamp'], req.headers['x-affonso-signature'], secret)) {
    console.error('Affonso webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  const data = event.data || {};

  switch (event.type) {
    case 'affiliate.created':
    case 'affiliate.confirmed':
      console.log(`Affiliate ${data.affiliateId} (${event.type}): ${data.email}, status ${data.status}`);
      break;
    case 'referral.lead':
    case 'referral.converted':
      console.log(`Referral ${data.referralId} (${event.type}) for affiliate ${data.affiliateId}`);
      break;
    case 'transaction.created':
    case 'transaction.approved':
    case 'transaction.paid':
    case 'transaction.rejected':
      console.log(
        `Transaction ${data.transactionId} (${event.type}): commission ${data.commissionAmount} ${data.commissionCurrency} (${data.commissionStatus})`
      );
      break;
    case 'payout.paid':
    case 'payout.failed':
      console.log(`Payout ${data.payoutId} (${event.type}): ${data.amount}, status ${data.status}`);
      break;
    default:
      console.log(`Unhandled event: ${event.type}`);
  }

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Affonso webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyAffonso };
