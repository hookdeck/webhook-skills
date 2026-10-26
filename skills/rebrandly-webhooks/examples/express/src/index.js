// Generated with: rebrandly-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time comparison of two strings. Lengths are checked first because
 * timingSafeEqual throws on buffers of unequal length.
 */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * Rebrandly does not sign webhooks. The sender adds a header you chose
 * (REBRANDLY_WEBHOOK_HEADER, default "Authorization") whose whole value must equal
 * REBRANDLY_WEBHOOK_SECRET. Compare the whole value: do not strip a "Bearer " prefix.
 */
function verifyRebrandlyRequest(
  headers,
  secret = process.env.REBRANDLY_WEBHOOK_SECRET,
  headerName = process.env.REBRANDLY_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()]; // Node lowercases header names
  return typeof received === 'string' && received.length > 0 && safeEqual(received, secret);
}

function handleClick(click) {
  const country = click.client?.location?.country;
  const destination = click.route?.destination?.raw;
  console.log(`Click on ${click.route?.id} from ${country ?? 'unknown'} at ${click.timestamp}`);
  // TODO: store the click (click.client, click.referral, click.route)
  return destination;
}

// Clickstream sends POST or PUT, depending on what you gave Rebrandly; accept any method.
// The body is read raw (any content type) and parsed only after the credential check.
app.all('/webhooks/rebrandly', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyRebrandlyRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook credential' });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (raw.trim() === '') {
    return res.status(200).json({ received: true, clicks: 0 }); // empty body: nothing to process
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }
  if (payload.data !== undefined && !Array.isArray(payload.data)) {
    return res.status(400).json({ error: 'Expected data to be an array of clicks' });
  }

  // Clickstream body: { data: [ click, ... ], key }. Only click events exist.
  const clicks = payload.data || [];
  try {
    for (const click of clicks) handleClick(click);
  } catch (err) {
    console.error('Error handling Rebrandly clicks:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true, clicks: clicks.length });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyRebrandlyRequest = verifyRebrandlyRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/rebrandly (any method)`);
  });
}
