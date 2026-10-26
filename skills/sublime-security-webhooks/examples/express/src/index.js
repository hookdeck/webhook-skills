// Generated with: sublime-security-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Sublime signs every webhook Action delivery in X-Sublime-Signature:
//   t=1626139320,v0=3d35d777...abaca06
// Each v0 value is the lowercase hex HMAC-SHA256 of "<t>.<raw body>" keyed with the Action's
// signing secret (UTF-8). The header can carry several signatures; accept any v0 match.
// https://docs.sublime.security/docs/webhooks#check-the-webhook-signature

// Optional replay window in seconds. Off by default (0): Hookdeck retries and replays carry the
// original timestamp, so a window would reject late redeliveries. Set
// SUBLIME_SECURITY_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other
// value is treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.SUBLIME_SECURITY_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`SUBLIME_SECURITY_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

// "t=1626139320,v0=<hex>" -> { timestamp: '1626139320', signatures: ['<hex>'] }
function parseSignatureHeader(header) {
  const parsed = { timestamp: undefined, signatures: [] };
  for (const item of header.split(',')) {
    const i = item.indexOf('=');
    if (i <= 0) continue;
    const key = item.slice(0, i).trim();
    const value = item.slice(i + 1).trim();
    if (key === 't') parsed.timestamp = value;
    else if (key === 'v0') parsed.signatures.push(value);
  }
  return parsed;
}

function verifySublime(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;

  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);
  if (!timestamp || !/^\d+$/.test(timestamp) || Number(timestamp) <= 0 || signatures.length === 0) {
    return false;
  }

  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0 && Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > tolerance) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest();
  // Buffer.from(x, 'hex') silently truncates invalid hex, so check the shape first.
  return signatures.some((sig) => {
    if (!/^[0-9a-fA-F]{64}$/.test(sig)) return false;
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected);
  });
}

// Raw body is required: the signature covers the exact bytes Sublime sent.
// type: '*/*' so any content type reaches the verifier as a Buffer.
app.post('/webhooks/sublime-security', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.SUBLIME_SECURITY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SUBLIME_SECURITY_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifySublime(rawBody, req.headers['x-sublime-signature'], secret)) {
    console.error('Sublime Security webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // payload.id is unique per delivery: use it to drop duplicates (see webhook-handler-patterns)
  const { id, type, data = {} } = payload;
  const messageId = data.message?.id;
  const rules = (data.flagged_rules || []).map((r) => r.name).join(', ');

  switch (type) {
    case 'message.flagged':
      console.log(`[${id}] Message ${messageId} flagged (${data.classification}): ${rules}`);
      break;
    case 'group':
      console.log(`[${id}] Message group triggered the Action: ${rules}`);
      break;
    case 'manual':
      console.log(`[${id}] Message ${messageId} sent manually from Sublime`);
      break;
    default:
      console.log(`Unhandled event type: ${type}`);
  }

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Sublime Security webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifySublime };
