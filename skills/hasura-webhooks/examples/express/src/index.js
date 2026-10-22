// Generated with: hasura-webhooks skill
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
 * Hasura Event Triggers are not signed. You add a secret header to the trigger
 * (Advanced settings > Headers); its name is yours to choose. We compare the WHOLE
 * header value with HASURA_WEBHOOK_SECRET (no Bearer parsing). This authenticates the
 * sender only: there is no body integrity and no replay protection.
 */
function verifyHasuraRequest(headers, options = {}) {
  const name = options.name ?? (process.env.HASURA_WEBHOOK_HEADER || 'Authorization');
  const secret = options.secret ?? process.env.HASURA_WEBHOOK_SECRET;
  if (!secret) return false; // never accept when unconfigured
  const received = headers[name.toLowerCase()]; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

function handleEvent(payload) {
  const { event, table, trigger, id } = payload;
  const where = `${table?.schema}.${table?.name}`;

  switch (event.op) {
    case 'INSERT':
      console.log(`Row inserted into ${where} (trigger ${trigger?.name}, id ${id})`);
      // TODO: handle event.data.new
      break;

    case 'UPDATE':
      console.log(`Row updated in ${where} (trigger ${trigger?.name}, id ${id})`);
      // TODO: compare event.data.old and event.data.new
      break;

    case 'DELETE':
      console.log(`Row deleted from ${where} (trigger ${trigger?.name}, id ${id})`);
      // TODO: handle event.data.old
      break;

    case 'MANUAL':
      console.log(`Manual invocation for ${where} (trigger ${trigger?.name}, id ${id})`);
      // TODO: handle event.data.new
      break;

    default:
      console.log(`Unhandled op: ${event.op}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/hasura', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyHasuraRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook header' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (
    !payload || typeof payload !== 'object' || Array.isArray(payload) ||
    !payload.event || typeof payload.event !== 'object' || typeof payload.event.op !== 'string'
  ) {
    return res.status(400).json({ error: 'Expected an Event Trigger payload with event.op' });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Hasura event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyHasuraRequest = verifyHasuraRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/hasura`);
  });
}
