// Generated with: honeybadger-webhooks skill
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
 * Honeybadger does not sign payloads. Every webhook carries a Honeybadger-Token
 * header: a secret token derived from the project API key, sent raw with no prefix.
 * (The optional Authorization: Bearer token is NOT what we check.)
 */
function verifyHoneybadgerRequest(headers, token = process.env.HONEYBADGER_TOKEN) {
  if (!token) return false; // never accept when unconfigured
  const received = headers['honeybadger-token'];
  return Boolean(received) && safeEqual(received, token);
}

function handleEvent(payload) {
  const { event, message } = payload;

  switch (event) {
    case 'occurred':
      console.log(`Error occurred: ${message}`);
      // TODO: page on-call or open a ticket (payload.fault, payload.notice)
      break;

    case 'resolved':
      console.log(`Error resolved: ${message}`);
      // TODO: close the matching ticket
      break;

    case 'unresolved':
      console.log(`Error reopened: ${message}`);
      // TODO: reopen the matching ticket
      break;

    case 'assigned':
      console.log(`Error assigned: ${message}`);
      // TODO: notify payload.assignee
      break;

    case 'commented':
      console.log(`Error commented: ${message}`);
      // TODO: sync payload.comment
      break;

    case 'rate_exceeded':
      console.log(`Error rate exceeded: ${message}`);
      // TODO: escalate
      break;

    case 'volume_spike':
      console.log(`Error volume spike: ${message}`);
      // TODO: escalate
      break;

    case 'deployed':
      console.log(`Deploy recorded: ${message}`);
      // TODO: annotate dashboards with payload.deploy
      break;

    case 'down':
      console.log(`Site down: ${message}`);
      // TODO: open an incident (payload.site, payload.outage)
      break;

    case 'up':
      console.log(`Site back up: ${message}`);
      // TODO: resolve the incident
      break;

    case 'cert_will_expire':
      console.log(`Certificate expiring: ${message}`);
      // TODO: schedule a renewal
      break;

    case 'check_in_missing':
      console.log(`Check-in missing: ${message}`);
      // TODO: alert on the stalled job (payload.check_in)
      break;

    case 'check_in_reporting':
      console.log(`Check-in reporting: ${message}`);
      // TODO: clear the missing-check-in alert
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/honeybadger', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyHoneybadgerRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Honeybadger-Token' });
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
    console.error('Error handling Honeybadger event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyHoneybadgerRequest = verifyHoneybadgerRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/honeybadger`);
  });
}
