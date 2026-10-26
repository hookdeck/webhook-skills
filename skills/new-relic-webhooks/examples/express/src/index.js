// Generated with: new-relic-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time comparison. Hashing both sides first gives equal-length buffers,
 * so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * New Relic does not sign webhooks. A Webhook destination can send
 * "Authorization: Basic base64(username:password)", which authenticates the sender
 * only. It does not cover the body and gives no replay protection.
 */
function verifyNewRelicRequest(
  headers,
  username = process.env.NEW_RELIC_WEBHOOK_USERNAME,
  password = process.env.NEW_RELIC_WEBHOOK_PASSWORD
) {
  if (!username || !password) return false; // never accept when unconfigured

  const match = /^basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(headers['authorization'] || '');
  if (!match) return false;

  const decoded = Buffer.from(match[1], 'base64');
  const colon = decoded.indexOf(0x3a); // split on the FIRST colon: passwords may contain ':'
  if (colon === -1) return false;

  // Evaluate both comparisons before deciding (no short-circuit).
  const userOk = safeEqual(decoded.subarray(0, colon), Buffer.from(username));
  const passOk = safeEqual(decoded.subarray(colon + 1), Buffer.from(password));
  return userOk && passOk;
}

// The payload comes from a Handlebars template you write in the workflow, so there is no
// fixed event field. This handler assumes the illustrative template in references/setup.md,
// which sends issueId, title, state, acknowledged, priority and issuePageUrl. state is New
// Relic's issue life cycle state (CREATED, ACTIVATED, CLOSED); acknowledged is its
// isAcknowledged boolean.
function handleIssue(payload) {
  const { issueId, title, priority, issuePageUrl } = payload;
  const state = String(payload.state || '').toUpperCase();
  const acknowledged = payload.acknowledged === true || payload.acknowledged === 'true';

  switch (state) {
    case 'CREATED':
    case 'ACTIVATED':
      if (acknowledged) {
        console.log(`Issue acknowledged: ${issueId} ${title}`);
        // TODO: mark the ticket as being worked
      } else {
        console.log(`Issue ${state.toLowerCase()}: ${issueId} ${title} (${priority}) ${issuePageUrl}`);
        // TODO: page on-call or open a ticket
      }
      break;

    case 'CLOSED':
      console.log(`Issue closed: ${issueId} ${title}`);
      // TODO: close the matching ticket
      break;

    default:
      console.log(`Unhandled state: ${payload.state}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/new-relic', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyNewRelicRequest(req.headers)) {
    return res
      .status(401)
      .set('WWW-Authenticate', 'Basic realm="new-relic"')
      .json({ error: 'Invalid or missing Basic credentials' });
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
    handleIssue(payload);
  } catch (err) {
    console.error('Error handling New Relic notification:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyNewRelicRequest = verifyNewRelicRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/new-relic`);
  });
}
