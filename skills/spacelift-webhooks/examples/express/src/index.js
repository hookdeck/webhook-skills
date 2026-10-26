// Generated with: spacelift-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Verify X-Signature-256: `sha256=<hex>` HMAC-SHA256 over the raw body bytes only.
 * The prefix is optional. The key is the secret's UTF-8 bytes, used as-is.
 */
function verifySpaceliftSignature(rawBody, header, secret = process.env.SPACELIFT_WEBHOOK_SECRET) {
  if (!secret || typeof header !== 'string') return false;
  const sig = header.trim().replace(/^sha256=/i, '');
  // Validate before decoding: Buffer.from(x, 'hex') silently drops bad characters.
  if (!/^[0-9a-fA-F]{64}$/.test(sig)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(sig.toLowerCase(), 'hex');
  return crypto.timingSafeEqual(expected, received); // both 32 bytes
}

// Spacelift has no event-name field: tell the two documented payload shapes apart.
function classify(payload) {
  if (!payload || typeof payload !== 'object') return 'unknown';
  if ('state' in payload && 'stateVersion' in payload && 'run' in payload) return 'run';
  if ('title' in payload && 'body' in payload) return 'internal_error';
  return 'unknown';
}

// Latest stateVersion seen per run. Use a shared store in production.
const lastVersion = new Map();

function handleMessage(payload) {
  const type = classify(payload);

  switch (type) {
    case 'run': {
      const runId = payload.run && payload.run.id;
      const prev = lastVersion.get(runId);
      // Updates can arrive out of order: ignore a stale stateVersion.
      if (prev !== undefined && payload.stateVersion <= prev) {
        console.log(`Ignoring stale run update ${runId} v${payload.stateVersion}`);
        break;
      }
      lastVersion.set(runId, payload.stateVersion);
      console.log(`Run ${runId} on stack ${payload.stack && payload.stack.id}: ${payload.state} (v${payload.stateVersion})`);
      // TODO: update your run tracking, notify a channel, etc.
      break;
    }

    case 'internal_error':
      console.log(`Spacelift internal error (${payload.severity}): ${payload.title}`);
      // TODO: alert the team
      break;

    default:
      console.log('Unhandled Spacelift message');
  }

  return type;
}

// Spacelift doesn't name the HTTP method, so accept all of them. Read the body raw
// (any content type) and verify before parsing. A missing body is zero bytes.
app.all('/webhooks/spacelift', express.raw({ type: '*/*' }), (req, res) => {
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return res.status(405).set('Allow', 'GET, POST, PUT, PATCH, DELETE').json({ error: 'Method not allowed' });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifySpaceliftSignature(raw, req.headers['x-signature-256'])) {
    return res.status(401).json({ error: 'Invalid or missing signature' });
  }

  let payload = null;
  if (raw.length > 0) {
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    if (payload === null || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Invalid payload' });
    }
  }

  try {
    const type = handleMessage(payload);
    res.status(200).json({ received: true, type });
  } catch (err) {
    console.error('Error handling Spacelift message:', err);
    res.status(500).json({ error: 'Handler error' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifySpaceliftSignature = verifySpaceliftSignature;
module.exports.classify = classify;
module.exports.lastVersion = lastVersion;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/spacelift`);
  });
}
