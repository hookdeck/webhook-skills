// Generated with: navattic-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Navattic's docs don't name the HTTP method, so accept all of these.
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

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
 * Navattic does not sign payloads. The only authentication is an Authorization header
 * ("Basic <credentials>" or "Bearer <token>"), sent only when configured on the webhook.
 * Compare the complete header value, including the scheme prefix. Don't parse or decode it.
 * A static credential authenticates the sender, not the body, and gives no replay protection.
 */
function verifyNavatticRequest(headers, config = process.env) {
  const expected = config.NAVATTIC_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers['authorization'];
  if (!received) return false;
  return safeEqual(received, expected);
}

/**
 * Visitor events carry { session, endUser, companyAccount }. Account events carry the
 * company account object itself as `data`.
 */
function classifyData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (data.session) return 'visitor';
  if (data.id || data.websiteDomain) return 'account';
  return null;
}

function handleEvent(payload) {
  switch (payload.eventType) {
    case 'session_closed': {
      const kind = classifyData(payload.data);
      if (kind === 'visitor') {
        const { session, endUser, companyAccount } = payload.data;
        console.log(
          `Visitor session closed at ${payload.timestamp}: ${session.mostRecentDemoName} ` +
            `(${endUser?.mostRecentEmail ?? 'unknown visitor'}, ${companyAccount?.name ?? 'no account'})`
        );
        // TODO: push the session to your CRM, notify sales
      } else if (kind === 'account') {
        console.log(`Account session closed at ${payload.timestamp}: ${payload.data.name ?? payload.data.id}`);
        // TODO: update the account in your system
      } else {
        console.log('session_closed with unrecognised data shape');
      }
      break;
    }

    default:
      console.log(`Unhandled Navattic event: ${payload.eventType}`);
  }
}

// Read the body raw so the request is authenticated before anything is parsed,
// whatever Content-Type or method Navattic uses.
function webhook(req, res) {
  if (!verifyNavatticRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Authorization header' });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (raw.trim() === '') {
    // Authenticated request with no body: nothing to process.
    return res.status(200).json({ received: true });
  }

  let payload;
  try {
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
    console.error('Error handling Navattic webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
}

for (const method of METHODS) {
  app[method]('/webhooks/navattic', express.raw({ type: '*/*' }), webhook);
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyNavatticRequest = verifyNavatticRequest;
module.exports.classifyData = classifyData;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/navattic`);
  });
}
