// Generated with: railway-webhooks skill
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
 * Railway does not sign payloads. You add a custom header (name and value) to the
 * webhook in Project Settings > Webhooks; Railway sends it with every delivery.
 * The header name is yours, so it comes from RAILWAY_WEBHOOK_HEADER, and the WHOLE
 * expected value (including any "Bearer " prefix) from RAILWAY_WEBHOOK_SECRET.
 * Node lowercases incoming header names, so the lookup is case-insensitive.
 */
function verifyRailwayRequest(
  headers,
  secret = process.env.RAILWAY_WEBHOOK_SECRET,
  headerName = process.env.RAILWAY_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}

function handleEvent(payload) {
  const { type, details, resource } = payload;
  const service = resource && resource.service && resource.service.name;

  switch (type) {
    case 'Deployment.failed':
      console.log(`Deployment failed${service ? ` for ${service}` : ''}: ${details && details.id}`);
      // TODO: alert the team (details.commitMessage, resource.project, resource.environment)
      break;

    default:
      // Other deployment states (Deployment.<state>) and alert types are not enumerated in
      // Railway's docs, so match on the prefix and log anything else.
      if (typeof type === 'string' && type.startsWith('Deployment.')) {
        console.log(`Deployment ${type.slice('Deployment.'.length)}${service ? ` for ${service}` : ''}`);
        // TODO: update your deploy dashboard
      } else {
        console.log(`Unhandled event: ${type}`);
      }
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/railway', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyRailwayRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook secret header' });
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
    console.error('Error handling Railway event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyRailwayRequest = verifyRailwayRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/railway`);
  });
}
