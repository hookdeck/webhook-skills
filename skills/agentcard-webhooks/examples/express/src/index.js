// Generated with: agentcard-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Agentcard signs every delivery with an AgentCard-Signature header:
//   t=<unix seconds>,v1=<hex>
// v1 is HMAC-SHA256 (hex) of "<t>.<raw body>". The key is the endpoint's WHOLE secret string,
// including the whsec_ prefix, as UTF-8. This is NOT Standard Webhooks: don't strip the prefix or
// base64-decode it, and don't use the standardwebhooks or svix libraries.
// The legacy X-AgentCard-Signature (sha256=<hex>, body only) header is not used here.
// https://docs.agentcard.com/webhooks/overview

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set AGENTCARD_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.AGENTCARD_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`AGENTCARD_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

// Split on ',', trim each part (a space after the comma is allowed), split on the first '='.
// Keep every v1 (Agentcard's docs show one; accepting any match is harmless).
function parseSignatureHeader(header) {
  let t;
  const v1 = [];
  for (const part of header.split(',')) {
    const trimmed = part.trim();
    const i = trimmed.indexOf('=');
    if (i <= 0) continue;
    const key = trimmed.slice(0, i).trim();
    const value = trimmed.slice(i + 1).trim();
    if (key === 't') t = value;
    else if (key === 'v1') v1.push(value);
  }
  return { t, v1 };
}

function verifyAgentcard(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;

  const { t, v1 } = parseSignatureHeader(signatureHeader);
  if (!t || v1.length === 0 || !/^\d+$/.test(t)) return false;

  // Opt-in only: off unless AGENTCARD_TIMESTAMP_TOLERANCE_SECONDS > 0.
  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0 && Math.abs(Math.floor(Date.now() / 1000) - Number(t)) > tolerance) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret) // whole secret string incl. whsec_, UTF-8, not decoded
    .update(`${t}.`)
    .update(rawBody)
    .digest(); // 32 bytes

  // Check for exactly 64 hex chars before Buffer.from(x, 'hex'): invalid hex silently truncates.
  return v1.some(
    (sig) => /^[0-9a-f]{64}$/i.test(sig) && crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected)
  );
}

// Raw body is required: the signature covers the exact bytes Agentcard sent.
// type: '*/*' reads the body whatever the Content-Type is, so verification never depends on it.
app.post('/webhooks/agentcard', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.AGENTCARD_WEBHOOK_SECRET;
  if (!secret) {
    console.error('AGENTCARD_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyAgentcard(rawBody, req.headers['agentcard-signature'], secret)) {
    console.error('Agentcard webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // Envelope: { id, type, created, livemode, data }. Delivery is at least once: dedupe on event.id.
  const data = event.data || {};
  switch (event.type) {
    case 'card.created':
      console.log(`Card ${data.id} created (**** ${data.last4}), balance ${data.balance_cents} cents`);
      break;
    case 'card.updated':
      console.log(`Card ${data.id} updated: status ${data.status}, balance ${data.balance_cents} cents`);
      break;
    case 'card.closed':
      console.log(`Card ${data.id} closed`);
      break;
    case 'transaction.authorized':
      console.log(`Transaction ${data.id} authorized on card ${data.card_id}: ${data.amount_display} at ${data.merchant}`);
      break;
    case 'approval.requested':
      console.log(`Approval ${data.approval_id} requested: ${data.action} (expires ${data.expires_at})`);
      break;
    case 'checkout_authorization.approved':
      console.log(`Checkout authorization ${data.authorization_id} approved: ${data.amount_display} at ${data.merchant}`);
      break;
    case 'balance.low':
      console.log(`Card ${data.card_id} balance low: ${data.balance_cents} cents`);
      break;
    default:
      console.log(`Unhandled event: ${event.type}`);
  }

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Agentcard webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyAgentcard };
