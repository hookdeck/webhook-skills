// Generated with: swan-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Lengths are checked first because
 * timingSafeEqual throws on buffers of different length.
 */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * Swan does not sign payloads. When the subscription has a webhook secret, every request
 * carries it as plain text in the x-swan-secret header. Compare the WHOLE header value
 * with the secret. (Express lowercases header names.)
 */
function verifySwanRequest(headers, secret = process.env.SWAN_WEBHOOK_SECRET) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers['x-swan-secret'];
  return typeof received === 'string' && received.length > 0 && safeEqual(received, secret);
}

// Swan delivers at least once, so the same eventId can arrive more than once.
// In production use a durable store (database, Redis) instead of process memory.
const processedEventIds = new Set();

function handleEvent(payload) {
  const { eventType, resourceId } = payload;

  // Notifications are thin: query the Swan API with resourceId for the details.
  switch (eventType) {
    case 'Transaction.Booked':
      console.log(`Transaction booked: ${resourceId}`);
      // TODO: fetch the transaction and update your ledger
      break;

    case 'Transaction.Pending':
      console.log(`Transaction pending: ${resourceId}`);
      // TODO: show the transaction as pending
      break;

    case 'Transaction.Rejected':
      console.log(`Transaction rejected: ${resourceId}`);
      // TODO: notify the account holder
      break;

    case 'Account.Created':
      console.log(`Account created: ${resourceId}`);
      // TODO: provision the account in your system
      break;

    case 'AccountHolder.Updated':
      console.log(`Account holder updated: ${resourceId}`);
      // TODO: refresh the account holder's verification status
      break;

    case 'Card.Created':
      console.log(`Card created: ${resourceId}`);
      // TODO: store the card reference
      break;

    case 'Onboarding.Updated':
      console.log(`Onboarding updated: ${resourceId}`);
      // TODO: fetch the onboarding and advance your KYC flow
      break;

    default:
      console.log(`Unhandled event: ${eventType}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/swan', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifySwanRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing x-swan-secret' });
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

  // Dedupe on eventId (at-least-once delivery); acknowledge duplicates.
  if (payload.eventId && processedEventIds.has(payload.eventId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Swan event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  if (payload.eventId) processedEventIds.add(payload.eventId);
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifySwanRequest = verifySwanRequest;
module.exports.processedEventIds = processedEventIds;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/swan`);
  });
}
