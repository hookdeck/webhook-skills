// Generated with: torii-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// The workflow author picks the HTTP method, so accept all the usual ones.
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

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
 * Torii requests are unsigned. The workflow author adds a secret header to the
 * custom action; the header name is user-chosen. Compare the WHOLE value
 * (including any "Bearer " prefix) with TORII_WEBHOOK_SECRET.
 * Node lower-cases header names, so the lookup is case-insensitive.
 */
function verifyToriiRequest(
  headers,
  secret = process.env.TORII_WEBHOOK_SECRET,
  headerName = process.env.TORII_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}

// ILLUSTRATIVE ONLY: Torii adds no event field. The body is whatever JSON template
// your workflow defines; "workflow" here is a field we made up for this example.
function handleWorkflowRequest(method, payload) {
  const workflow = payload && payload.workflow;

  switch (workflow) {
    case 'new app discovered':
      console.log(`[${method}] New app discovered:`, payload.app);
      // TODO: open a review ticket for the app
      break;

    case 'user offboarding':
      console.log(`[${method}] User offboarding:`, payload.user);
      // TODO: revoke access in downstream systems
      break;

    default:
      console.log(`[${method}] Workflow request:`, payload);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.all('/webhooks/torii', express.raw({ type: '*/*' }), (req, res) => {
  if (!METHODS.includes(req.method.toLowerCase())) {
    res.set('Allow', METHODS.map((m) => m.toUpperCase()).join(', '));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifyToriiRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing credential header' });
  }

  // An empty body is valid (a GET, or a template with no body).
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  let payload = null;
  if (raw.trim() !== '') {
    try {
      payload = JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }

  try {
    handleWorkflowRequest(req.method, payload);
  } catch (err) {
    console.error('Error handling Torii request:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyToriiRequest = verifyToriiRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/torii (POST, PUT, PATCH, GET, DELETE)`);
  });
}
