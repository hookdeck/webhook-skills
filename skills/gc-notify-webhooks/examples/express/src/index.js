// Generated with: gc-notify-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time comparison. Hashing both sides first gives equal-length buffers,
 * so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const BEARER = /^bearer /i; // auth schemes are case-insensitive (RFC 9110)

/**
 * GC Notify does not sign callbacks. It adds `Authorization: Bearer <token>` to every
 * request, where the token is the one you set for the callback. The configured value is
 * the bare token; if it was pasted with a leading "Bearer " the scheme is stripped.
 * The secret is never trimmed or otherwise altered.
 */
function verifyGcNotifyRequest(headers, configured = process.env.GC_NOTIFY_WEBHOOK_SECRET) {
  const secret = configured ? configured.replace(BEARER, '') : '';
  if (!secret) return false; // never accept when unconfigured
  const header = headers['authorization'];
  if (typeof header !== 'string' || !BEARER.test(header)) return false;
  // Node decodes header bytes as latin1; re-encode to recover the raw bytes.
  return safeEqual(Buffer.from(header.slice(7), 'latin1'), Buffer.from(secret, 'utf8'));
}

function handleReceipt(payload) {
  // GC Notify callbacks have no event field: dispatch on status.
  const { status, id, reference, to, notification_type: type } = payload;

  if (payload.health_check) {
    console.log('GC Notify health check');
    return;
  }

  switch (status) {
    case 'created':
    case 'sending':
    case 'pending':
    case 'sent':
    case 'pending-virus-check':
      console.log(`${type} ${id} in transit (${status}) for ${reference}`);
      break;

    case 'delivered':
      console.log(`${type} ${id} delivered to ${to}`);
      // TODO: mark the message delivered (payload.completed_at)
      break;

    case 'permanent-failure':
      console.log(`${type} ${id} permanently failed: ${payload.status_description}`);
      // TODO: stop sending to this address or number
      break;

    case 'temporary-failure':
      console.log(`${type} ${id} temporarily failed: ${payload.status_description}`);
      // TODO: record it; a later callback may report the final outcome
      break;

    case 'technical-failure':
      console.log(`${type} ${id} technical failure: ${payload.provider_response}`);
      // TODO: alert and consider resending
      break;

    case 'virus-scan-failed':
      console.log(`${type} ${id} attachment failed the virus scan`);
      // TODO: tell the sender their attachment was rejected
      break;

    default:
      console.log(`Unhandled status: ${status}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/gc-notify', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyGcNotifyRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing bearer token' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  // Respond within 1 second: keep slow work off this path (queue it).
  try {
    handleReceipt(payload);
  } catch (err) {
    console.error('Error handling GC Notify callback:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyGcNotifyRequest = verifyGcNotifyRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/gc-notify`);
  });
}
