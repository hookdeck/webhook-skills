// Generated with: procore-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Procore does not sign payloads. The only credential is the optional "Authorization Header"
 * value configured on the hook, which Procore places verbatim in the Authorization header.
 * Compare the WHOLE header value, including any "Bearer " / "Basic " prefix. Never strip,
 * parse or base64-decode it.
 */
function verifyProcoreRequest(headers, config = process.env) {
  const expected = config.PROCORE_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers['authorization'];
  if (!received) return false;
  return safeEqual(received, expected);
}

function handleEvent(payload) {
  const { event_type: eventType, resource_name: resource, resource_id: resourceId } = payload;

  switch (eventType) {
    case 'create':
      console.log(`${resource} ${resourceId} created`);
      // TODO: fetch the new record via the Procore REST API and sync it
      break;

    case 'update':
      console.log(`${resource} ${resourceId} updated`);
      // TODO: refresh your copy of the record
      break;

    case 'delete':
      console.log(`${resource} ${resourceId} deleted`);
      // TODO: remove or archive your copy of the record
      break;

    default:
      console.log(`Unhandled Procore event_type: ${eventType}`);
  }
}

// Read the body raw so the request is authenticated before anything is parsed,
// whatever Content-Type Procore uses.
app.post('/webhooks/procore', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyProcoreRequest(req.headers)) {
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
    console.error('Error handling Procore webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyProcoreRequest = verifyProcoreRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/procore`);
  });
}
