// Generated with: redo-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Redo does not sign payloads. The only authentication is the static
 * `Authorization: Bearer <subscriber-secret>` header. Compare the complete header
 * value, including the "Bearer " prefix (do not strip or parse it).
 * A static credential authenticates the sender, not the body, and gives no replay
 * protection: use HTTPS and rotate the secret if it leaks.
 */
function verifyRedoRequest(headers, config = process.env) {
  const expected = config.REDO_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers['authorization'];
  if (!received) return false;
  return safeEqual(received, expected);
}

/**
 * Subscribe with the topics return.created and return.updated; the payload `type` is
 * the short form (created, updated), plus `backfill` for historical events.
 */
function classify(payload) {
  switch (payload.type) {
    case 'created':
      return 'return.created';
    case 'updated':
      return 'return.updated';
    case 'backfill':
      return 'backfill';
    default:
      return null;
  }
}

function handleEvent(payload) {
  const ret = payload.return || {};

  switch (classify(payload)) {
    case 'return.created':
      console.log(`Return ${ret.id} created (${ret.status})`);
      // TODO: open a ticket or notify the warehouse
      break;

    case 'return.updated':
      console.log(`Return ${ret.id} updated (${ret.status})`);
      // TODO: sync the return status; dedupe on return.id + payload.at
      break;

    case 'backfill':
      console.log(`Backfill event for return ${ret.id}`);
      // TODO: load history without triggering customer-facing side effects
      break;

    default:
      console.log(`Unhandled Redo event type: ${payload.type}`);
  }
}

// Read the body raw so the request is authenticated before anything is parsed,
// whatever Content-Type Redo uses.
app.post('/webhooks/redo', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyRedoRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Authorization header' });
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

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Redo webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyRedoRequest = verifyRedoRequest;
module.exports.classify = classify;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/redo`);
  });
}
