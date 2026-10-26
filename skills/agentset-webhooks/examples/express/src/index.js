// Generated with: agentset-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Agentset's docs don't name the HTTP method, so accept all five.
const METHODS = new Set(['POST', 'PUT', 'PATCH', 'GET', 'DELETE']);

const HEX64 = /^[0-9a-fA-F]{64}$/;

/**
 * Agentset sends `agentset-signature`: the bare hex HMAC-SHA256 of the raw body, keyed with the
 * webhook's signing secret (UTF-8 bytes, as-is). Nothing else is signed, so there is no timestamp
 * or replay window to check. The format is validated before decoding.
 */
function verifyAgentsetSignature(rawBody, signature, secret = process.env.AGENTSET_WEBHOOK_SECRET) {
  if (!secret || typeof signature !== 'string' || !HEX64.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // safe: validated above
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : undefined);

// Every parsed field is untrusted: check its type before reading into it.
function handleEvent(payload) {
  const event = str(payload.event);
  const data = isObject(payload.data) ? payload.data : {};
  const id = str(data.id);
  const name = str(data.name);

  switch (event) {
    case 'document.ready':
      console.log(`Document ready: ${id} (${name})`);
      // TODO: mark the document as searchable
      break;

    case 'document.error':
      console.log(`Document failed: ${id} (${name}): ${str(data.error)}`);
      // TODO: alert and surface the error
      break;

    case 'document.deleted':
      console.log(`Document deleted: ${id}`);
      // TODO: remove local records
      break;

    case 'ingest_job.ready':
      console.log(`Ingest job ready: ${id} (${name})`);
      // TODO: mark the import as complete
      break;

    case 'ingest_job.error':
      console.log(`Ingest job failed: ${id} (${name}): ${str(data.error)}`);
      // TODO: alert and retry
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

// Read the body raw (any content type) so the exact bytes are verified before parsing.
app.all('/webhooks/agentset', express.raw({ type: '*/*' }), (req, res) => {
  if (!METHODS.has(req.method)) {
    res.set('Allow', [...METHODS].join(', '));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // A request with no body (e.g. GET) is verified over zero bytes.
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyAgentsetSignature(rawBody, req.get('agentset-signature'))) {
    return res.status(401).json({ error: 'Invalid or missing signature' });
  }

  if (rawBody.length === 0 || rawBody.toString('utf8').trim() === '') {
    console.log(`${req.method} webhook with empty body`);
    return res.status(200).json({ received: true });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!isObject(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Agentset webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyAgentsetSignature = verifyAgentsetSignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/agentset`);
  });
}
