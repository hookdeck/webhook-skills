// Generated with: buildkite-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Buildkite sends one of two headers, depending on the webhook's Token setting:
// - X-Buildkite-Token (default): the token in plain text
// - X-Buildkite-Signature: "timestamp=<unix>,signature=<hex>", where signature is
//   HMAC-SHA256 of "<timestamp>.<raw body>" keyed with the token
// https://buildkite.com/docs/apis/webhooks/pipelines

// Buildkite suggests rejecting old timestamps (e.g. 5 minutes) to defend against replay.
const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function parseSignatureHeader(header) {
  const parts = {};
  for (const kv of header.split(',')) {
    const i = kv.indexOf('=');
    if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  return parts;
}

function verifyBuildkite(rawBody, headers, token) {
  if (!token) return false;

  const signatureHeader = headers['x-buildkite-signature'];
  if (signatureHeader) {
    const { timestamp, signature } = parseSignatureHeader(signatureHeader);
    if (!timestamp || !signature) return false;

    const ts = Number(timestamp);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(ts) || Math.abs(now - ts) > TIMESTAMP_TOLERANCE_SECONDS) {
      return false;
    }

    const expected = crypto
      .createHmac('sha256', token)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest('hex');
    return safeEqual(signature, expected);
  }

  // Token mode: constant-time compare of the plain-text header
  const tokenHeader = headers['x-buildkite-token'];
  return !!tokenHeader && safeEqual(tokenHeader, token);
}

// Raw body is required: the signature covers the exact bytes Buildkite sent
app.post('/webhooks/buildkite', express.raw({ type: '*/*' }), (req, res) => {
  const token = process.env.BUILDKITE_WEBHOOK_TOKEN;
  if (!token) {
    console.error('BUILDKITE_WEBHOOK_TOKEN is not set');
    return res.status(500).send('Webhook token not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyBuildkite(rawBody, req.headers, token)) {
    console.error('Buildkite webhook verification failed');
    return res.status(400).send('Invalid token or signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  const event = req.headers['x-buildkite-event'] || payload.event;

  switch (event) {
    case 'ping':
      console.log('Ping received');
      break;
    case 'build.scheduled':
    case 'build.running':
    case 'build.failing':
      console.log(`Build ${payload.build?.number} (${event})`);
      break;
    case 'build.finished':
      console.log(`Build ${payload.build?.number} finished: ${payload.build?.state}`);
      break;
    case 'job.started':
    case 'job.finished':
      console.log(`Job ${payload.job?.id} (${event})`);
      break;
    case 'agent.connected':
      console.log(`Agent connected: ${payload.agent?.name}`);
      break;
    default:
      console.log(`Unhandled event: ${event}`);
  }

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Buildkite webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyBuildkite };
