// Generated with: langfuse-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

/**
 * Verify the x-langfuse-signature header: `t=<timestamp>,v1=<hex>`.
 * v1 = hex HMAC-SHA256(key = secret as UTF-8, message = `<t>.<raw body bytes>`).
 * `t` is used exactly as it appears in the header (never parsed and re-formatted).
 * Any v1= entry may match (key rotation); other keys such as v0 are ignored.
 */
function verifyLangfuseSignature(
  rawBody,
  signatureHeader,
  secret = process.env.LANGFUSE_WEBHOOK_SECRET,
  toleranceSeconds = Number(process.env.LANGFUSE_WEBHOOK_TOLERANCE_SECONDS) || 0,
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  if (!secret || !signatureHeader || !Buffer.isBuffer(rawBody)) return false;

  let timestamp;
  const candidates = [];
  for (const part of String(signatureHeader).split(',')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === 't' && timestamp === undefined) timestamp = value;
    else if (key === 'v1') candidates.push(value);
  }
  if (!timestamp || candidates.length === 0) return false;

  // Opt-in replay window (t is Unix seconds). Off by default.
  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) return false;
  }

  // Signed message is built as bytes: `${t}.` + the raw body exactly as received.
  const expected = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), rawBody]))
    .digest();

  let ok = false;
  for (const candidate of candidates) {
    // Validate length and alphabet before decoding: Buffer.from(x, 'hex') silently drops bad characters.
    if (!HEX_SHA256.test(candidate)) continue;
    const received = Buffer.from(candidate.toLowerCase(), 'hex');
    if (received.length === expected.length && crypto.timingSafeEqual(received, expected)) ok = true;
  }
  return ok;
}

function handleEvent(event) {
  switch (event.action) {
    case 'created':
      console.log(`Prompt version created: ${event.prompt?.name} v${event.prompt?.version}`);
      break;
    case 'updated':
      // Fires twice for a label/tag move: once for the version gaining it, once for the version losing it.
      console.log(`Prompt version updated: ${event.prompt?.name} v${event.prompt?.version}`, event.prompt?.labels);
      break;
    case 'deleted':
      console.log(`Prompt version deleted: ${event.prompt?.name} v${event.prompt?.version}`);
      break;
    default:
      console.log(`Unhandled Langfuse action: ${event.action}`);
  }
}

// express.raw with '*/*' keeps the exact bytes for any content type; parse only after verifying.
app.post('/webhooks/langfuse', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.headers['x-langfuse-signature'];
  if (!signature) {
    return res.status(401).json({ error: 'Missing x-langfuse-signature header' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyLangfuseSignature(rawBody, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (event === null || typeof event !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling Langfuse event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyLangfuseSignature = verifyLangfuseSignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/langfuse`);
  });
}
