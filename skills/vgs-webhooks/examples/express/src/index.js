// Generated with: vgs-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// VGS signs every notification with the vgs-signature header:
//   vgs-signature: t=<unix seconds>,v0=<hex>
// v0 is HMAC-SHA256 of "<t>.<raw body>" keyed with the integration secret (UTF-8).
// https://docs.verygoodsecurity.com/enterprise-platform/developer-resources/webhook-notifications

// Optional freshness window in seconds. Off by default (0): VGS retries and Hookdeck
// retries/replays carry the original timestamp, so a window would reject late redeliveries.
// Set VGS_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds() {
  const raw = (process.env.VGS_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`VGS_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

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

function verifyVgs(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  const { t, v0 } = parseSignatureHeader(signatureHeader);
  if (!t || !v0) return false;

  const ts = Number(t);
  if (!Number.isInteger(ts)) return false;
  // VGS's own example uses 60s. It's opt-in here: off unless VGS_TIMESTAMP_TOLERANCE_SECONDS > 0.
  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0 && Math.abs(Math.floor(Date.now() / 1000) - ts) > tolerance) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${t}.`)
    .update(rawBody)
    .digest('hex');
  return safeEqual(v0, expected);
}

// Raw body is required: the signature covers the exact bytes VGS sent, whatever the content type
app.post('/webhooks/vgs', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.VGS_WEBHOOK_SECRET;
  if (!secret) {
    console.error('VGS_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyVgs(rawBody, req.headers['vgs-signature'], secret)) {
    console.error('VGS webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // The event type is the top-level "event" field (there is no event header)
  const event = payload.event;
  const details = payload.details || {};

  switch (event) {
    case 'route.created':
    case 'route.updated':
    case 'route.delete':
      console.log(`Route ${details.route_name} (${details.route_id}): ${event}`);
      break;
    case 'vault.created':
      console.log(`Vault created: ${details.vault_name} (${details.vault_id})`);
      break;
    case 'user.permissions_updated':
    case 'user.permissions_deleted':
      console.log(`Permissions changed for ${details.user_email}: ${event}`);
      break;
    case 'user.logged_in':
    case 'user.password_updated':
    case 'user.mfa_created':
    case 'user.mfa_deleted':
      console.log(`User ${details.user_email} from ${details.user_ip}: ${event}`);
      break;
    case 'proxy.upstream_error':
      console.log(`Upstream error from ${details.upstream_host} (occurrence ${payload.occurrence})`);
      break;
    case 'alias.reveal_failed':
      console.log(`Alias reveal failed (occurrence ${payload.occurrence})`);
      break;
    default:
      console.log(`Unhandled event: ${event}`);
  }

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`VGS webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyVgs };
