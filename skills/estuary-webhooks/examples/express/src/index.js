// Generated with: estuary-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

// Hashing both sides gives equal-length buffers, so timingSafeEqual never throws.
const digest = (buf) => crypto.createHash('sha256').update(buf).digest();

/**
 * Estuary does not sign requests. You add a secret header to the materialization
 * trigger (or the HTTP Webhook connector's custom headers). The header name is yours,
 * so it comes from ESTUARY_WEBHOOK_HEADER (default Authorization). The WHOLE value is
 * compared with ESTUARY_WEBHOOK_SECRET: a "Bearer " prefix is not stripped or parsed.
 * This is a static credential: it authenticates the sender, not the body, and gives no
 * replay protection.
 */
function verifyEstuaryRequest(headers, env = process.env) {
  const expected = env.ESTUARY_WEBHOOK_SECRET;
  if (!expected) return false; // never accept when unconfigured
  const name = (env.ESTUARY_WEBHOOK_HEADER || 'Authorization').toLowerCase();
  const received = headers[name]; // Node lowercases header names
  if (!received) return false;
  // Header strings are Latin-1 decoded wire bytes; the secret is whatever you typed (UTF-8).
  return crypto.timingSafeEqual(
    digest(Buffer.from(received, 'latin1')),
    digest(Buffer.from(expected, 'utf8'))
  );
}

/**
 * There is no vendor event field. The HTTP Webhook connector POSTs a JSON array of
 * documents from one binding; a trigger body is whatever its payloadTemplate renders,
 * so its keys are the ones you chose (Estuary's example uses materialization and runId).
 */
function classify(payload) {
  if (payload === null) return 'empty';
  if (Array.isArray(payload)) return 'documents';
  return 'trigger';
}

function handleEvent(payload) {
  switch (classify(payload)) {
    case 'trigger':
      console.log('Estuary trigger received');
      // Your code: react to the committed transaction (e.g. start a downstream job)
      break;
    case 'documents':
      console.log(`Estuary connector batch: ${payload.length} documents`);
      // Your code: store or process the documents
      break;
    default:
      console.log('Estuary request with an empty body');
  }
}

// Body is read raw so the request is authenticated before anything is parsed,
// whatever the content type or method.
app.all('/webhooks/estuary', express.raw({ type: '*/*' }), (req, res) => {
  // Credential first, for every method.
  if (!verifyEstuaryRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing credential header' });
  }

  if (!ALLOWED_METHODS.includes(req.method)) {
    return res.status(405).set('Allow', ALLOWED_METHODS.join(', ')).json({ error: 'Method not allowed' });
  }

  // Empty body: express.raw leaves req.body as {} when nothing was sent.
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  let payload = null;
  if (raw.trim() !== '') {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { raw }; // the payloadTemplate may not be JSON
    }
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Estuary webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyEstuaryRequest = verifyEstuaryRequest;
module.exports.classify = classify;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: ${ALLOWED_METHODS.join('|')} http://localhost:${PORT}/webhooks/estuary`);
  });
}
