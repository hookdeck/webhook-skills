// Generated with: particle-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest();

/**
 * Particle does not sign webhooks. Authenticate with a secret header you add to the
 * integration. The header name is yours to choose (PARTICLE_WEBHOOK_HEADER, default
 * Authorization) and the WHOLE value is compared, so "Bearer " is not stripped or parsed.
 * Hashing both sides gives equal-length buffers, so timingSafeEqual never throws.
 * Node exposes header values as latin1 strings; re-encode to recover the raw bytes.
 */
function verifyParticleRequest(
  headers,
  secret = process.env.PARTICLE_WEBHOOK_SECRET,
  headerName = process.env.PARTICLE_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()]; // Node lowercases header names
  if (!received) return false;
  return crypto.timingSafeEqual(
    sha256(Buffer.from(received, 'latin1')),
    sha256(Buffer.from(secret, 'utf8'))
  );
}

/**
 * Default Particle body: application/x-www-form-urlencoded with event, data,
 * published_at and coreid. JSON bodies and GET query strings are also supported.
 * An empty body is valid (GET, DELETE).
 */
function parseParticlePayload(rawBody, contentType, searchParams) {
  const payload = Object.fromEntries(searchParams);
  const text = rawBody.toString('utf8');
  if (!text.trim()) return payload;

  const type = (contentType || '').toLowerCase();
  let body;
  if (type.includes('json')) {
    body = JSON.parse(text); // throws on malformed JSON
  } else if (type.includes('x-www-form-urlencoded')) {
    body = Object.fromEntries(new URLSearchParams(text));
  } else {
    try {
      body = JSON.parse(text); // custom bodies: JSON if it parses, else keep the text
    } catch {
      body = { raw: text };
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Expected an object body');
  }
  return { ...payload, ...body };
}

// Event names are chosen by your device firmware (Particle.publish("temperature", ...)).
// These two are illustrative; replace them with your own.
function handleEvent(payload) {
  const { event, data, coreid, published_at: publishedAt } = payload;

  switch (event) {
    case 'temperature':
      console.log(`Temperature ${data} from ${coreid} at ${publishedAt}`);
      // TODO: store the reading (parseFloat(data))
      return 'temperature';

    case 'motion-detected':
      console.log(`Motion detected on ${coreid} at ${publishedAt}`);
      // TODO: raise an alert
      return 'motion-detected';

    default:
      console.log(`Unhandled event: ${event}`);
      return 'unhandled';
  }
}

// Read the body raw (any content type); authenticate first, parse second.
function webhookRoute(req, res) {
  if (!verifyParticleRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook header' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const { searchParams } = new URL(req.originalUrl, 'http://localhost');
    payload = parseParticlePayload(raw, req.headers['content-type'], searchParams);
  } catch {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  try {
    const handled = handleEvent(payload);
    res.status(200).json({ received: true, event: handled });
  } catch (err) {
    console.error('Error handling Particle event:', err);
    res.status(500).json({ error: 'Handler error' });
  }
}

// requestType may be GET, POST, PUT or DELETE (PATCH accepted too); every method is authenticated.
for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
  app[method]('/webhooks/particle', express.raw({ type: '*/*' }), webhookRoute);
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyParticleRequest = verifyParticleRequest;
module.exports.parseParticlePayload = parseParticlePayload;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/particle`);
  });
}
