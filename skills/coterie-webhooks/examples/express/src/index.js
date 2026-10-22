// Generated with: coterie-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the token's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Coterie does not sign payloads. The only authentication is an opt-in static header
 * named `Authentication` (not `Authorization`) whose whole value is `token <guid>`.
 * Compare the complete header value, including the "token " prefix.
 */
function verifyCoterieRequest(headers, config = process.env) {
  const expected = config.COTERIE_AUTHENTICATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers['authentication'];
  if (!received) return false;
  return safeEqual(received, expected);
}

/**
 * Coterie webhooks have no event-type field. The three kinds (application, quote,
 * policy) are told apart by their identifier key.
 */
function classify(payload) {
  const keys = new Set(Object.keys(payload).map((k) => k.toLowerCase()));
  if (keys.has('quoteid')) return 'quote';
  if (keys.has('policyid')) return 'policy';
  if (keys.has('applicationid')) return 'application';
  return null;
}

function handleEvent(payload) {
  const kind = classify(payload);

  switch (kind) {
    case 'application':
      console.log(`Application ${payload.applicationId}: ${payload.Status}`);
      // TODO: sync the application status (e.g. ReadyToQuote) to your system
      break;

    case 'quote':
      console.log(`Quote ${payload.quoteId} (${payload.PolicyType}): premium ${payload.Premium}`);
      // TODO: show the quote to the customer
      break;

    case 'policy':
      console.log(`Policy ${payload.PolicyNumber}: ${payload.Status}`);
      // TODO: record the policy status (e.g. Pending)
      break;

    default:
      console.log('Unhandled Coterie payload (no applicationId, quoteId or PolicyId)');
  }
}

// Read the body raw so the request is authenticated before anything is parsed,
// whatever Content-Type Coterie uses.
app.post('/webhooks/coterie', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyCoterieRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Authentication header' });
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
    console.error('Error handling Coterie webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyCoterieRequest = verifyCoterieRequest;
module.exports.classify = classify;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/coterie`);
  });
}
