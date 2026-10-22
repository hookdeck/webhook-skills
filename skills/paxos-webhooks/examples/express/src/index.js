// Generated with: paxos-webhooks skill
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
 * Paxos does not sign webhook events. With Auth Type "API Key", Paxos sends the header
 * name and value you configured on the webhook. The whole header value is compared
 * as-is (no "Bearer " parsing). Node lowercases incoming header names.
 */
function verifyPaxosRequest(
  headers,
  secret = process.env.PAXOS_WEBHOOK_SECRET,
  headerName = process.env.PAXOS_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}

function handleEvent(event) {
  const { id, type } = event;

  // At-least-once delivery: dedupe on event.id before doing real work.
  // Events are thin: fetch the full object with the Get Event API using event.id.
  switch (type) {
    case 'identity.approved':
      console.log(`Identity approved (event ${id})`);
      // TODO: Get Event, then mark the identity as verified
      break;

    case 'identity.denied':
      console.log(`Identity denied (event ${id})`);
      // TODO: Get Event, then notify the customer
      break;

    case 'identity.documents_required':
      console.log(`Identity documents required (event ${id})`);
      // TODO: Get Event, then ask the customer for documents
      break;

    case 'identity.documents_accepted':
    case 'identity.documents_denied':
      console.log(`Identity EDD review result: ${type} (event ${id})`);
      // TODO: Get Event for the review outcome
      break;

    default:
      if (/^transfer\.[a-z_]+\.(pending|completed|failed)$/.test(type)) {
        console.log(`Transfer event ${type} (event ${id})`);
        // TODO: Get Event, then update the deposit or withdrawal, e.g. transfer.crypto_deposit.completed
      } else if (/^orchestration\.(processing|pending|rejected|completed|failed)$/.test(type)) {
        console.log(`Orchestration event ${type} (event ${id})`);
        // TODO: Get Event, then update the mint, convert or redeem
      } else {
        console.log(`Unhandled event: ${type}`);
      }
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/paxos', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyPaxosRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook credential' });
  }

  let event;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    event = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string') {
    return res.status(400).json({ error: 'Expected a JSON event object with a type' });
  }

  // Test events come from the Dashboard Test feature only.
  if (event.is_test === true) {
    console.log('Received test event, ignoring...');
    return res.status(200).json({ received: true, test: true });
  }

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling Paxos event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyPaxosRequest = verifyPaxosRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/paxos`);
  });
}
