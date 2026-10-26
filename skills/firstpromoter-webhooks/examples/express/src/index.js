// Generated with: firstpromoter-webhooks skill
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
 * FirstPromoter does not sign payloads. Webhooks v2 subscriptions can send custom
 * headers; the header name is whatever you chose, and its value is compared whole
 * (do not strip a "Bearer " prefix). A static credential authenticates the sender,
 * not the body, and gives no replay protection: use HTTPS and dedupe on event_id.
 */
function verifyFirstPromoterRequest(
  headers,
  secret = process.env.FIRSTPROMOTER_WEBHOOK_SECRET,
  name = process.env.FIRSTPROMOTER_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[name.toLowerCase()]; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

// In-memory dedupe for the example; use a durable store (Redis, database) in production.
const seenEvents = new Set();

function handleEvent(payload) {
  const { event_type: type, entity_id: id, data = {}, changes = {} } = payload;

  switch (type) {
    case 'promoter.created':
      console.log(`Promoter created: ${data.email} (${id})`);
      // TODO: create a CRM contact, send onboarding
      break;

    case 'promoter.updated':
      console.log(`Promoter updated: ${id}`, Object.keys(changes));
      // TODO: sync the profile
      break;

    case 'promoter.deleted':
      console.log(`Promoter deleted: ${id}`);
      // TODO: deprovision
      break;

    case 'promoter.balance.updated':
      console.log(`Promoter balance updated: ${id}`);
      // TODO: update the balance shown in your app
      break;

    case 'referral.created':
      console.log(`Referral created: ${data.email} (${id})`);
      // TODO: attribute the signup
      break;

    case 'referral.updated':
      console.log(`Referral updated: ${id}`, Object.keys(changes));
      // TODO: sync state (changes.state = [old, new])
      break;

    case 'referral.converted':
      console.log(`Referral converted: ${data.email} (${id})`);
      // TODO: credit the promoter, notify
      break;

    case 'referral.cancelled':
      console.log(`Referral cancelled: ${id}`);
      // TODO: reverse benefits
      break;

    case 'referral.deleted':
      console.log(`Referral deleted: ${id}`);
      // TODO: clean up
      break;

    case 'referral.moved':
      console.log(`Referral moved campaign: ${id}`);
      // TODO: re-tier
      break;

    case 'commission.created':
      console.log(`Commission created: ${id} amount=${data.amount} ${data.unit}`);
      // TODO: record the liability
      break;

    case 'commission.updated':
      console.log(`Commission updated: ${id}`, Object.keys(changes));
      // TODO: sync status
      break;

    case 'commission.approved':
      console.log(`Commission approved: ${id}`);
      // TODO: queue for payout
      break;

    case 'commission.pending':
      console.log(`Commission pending: ${id}`);
      // TODO: hold
      break;

    case 'commission.denied':
      console.log(`Commission denied: ${id}`);
      // TODO: notify the promoter
      break;

    case 'commission.deleted':
      console.log(`Commission deleted: ${id}`);
      // TODO: remove the liability
      break;

    case 'payout.created':
      console.log(`Payout created: ${id}`);
      // TODO: open a payout record
      break;

    case 'payout.completed':
      console.log(`Payout completed: ${id}`);
      // TODO: mark as paid
      break;

    case 'payout.failed':
      console.log(`Payout failed: ${id}`);
      // TODO: alert finance
      break;

    case 'contract_document.signed':
      console.log(`Contract signed: ${id} by promoter ${data.promoter_id}`);
      // TODO: unlock the program for the promoter
      break;

    default:
      console.log(`Unhandled event: ${type}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/firstpromoter', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyFirstPromoterRequest(req.headers)) {
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

  // Retries redeliver the same event_id; acknowledge repeats without reprocessing.
  const eventId = payload.event_id || req.headers['x-event-id'];
  if (eventId && seenEvents.has(eventId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling FirstPromoter event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  if (eventId) seenEvents.add(eventId);
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyFirstPromoterRequest = verifyFirstPromoterRequest;
module.exports.seenEvents = seenEvents;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/firstpromoter`);
  });
}
