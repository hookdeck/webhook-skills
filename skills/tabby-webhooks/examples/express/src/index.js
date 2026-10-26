// Generated with: tabby-webhooks skill
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
 * Tabby does not sign payloads. If you set header.title / header.value when registering the
 * webhook, Tabby adds that header to every notification. The name is yours (default X-Auth-Key);
 * the whole value is compared, with no Bearer-prefix parsing. A static credential authenticates
 * the sender, not the body, and gives no replay protection.
 */
function verifyTabbyRequest(
  headers,
  name = process.env.TABBY_WEBHOOK_HEADER || 'X-Auth-Key',
  secret = process.env.TABBY_WEBHOOK_SECRET
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[name.toLowerCase()]; // Node lower-cases header names
  return Boolean(received) && safeEqual(received, secret);
}

// Payment webhooks have no event field: the event is what changed.
function handlePayment(payment) {
  const { id, status, captures = [], refunds = [] } = payment;

  switch (status) {
    case 'authorized':
      if (captures.length === 0) {
        console.log(`Payment authorized: ${id}`);
        // TODO: process the order, then send the Capture Request
      } else {
        console.log(`Payment captured: ${id}`);
        // TODO: nothing to do, this confirms your own capture
      }
      break;

    case 'closed':
      if (refunds.length > 0) {
        console.log(`Payment closed with refunds: ${id}`);
        // TODO: record the latest entry in payment.refunds
      } else {
        console.log(`Payment closed: ${id}`);
        // TODO: mark the order paid; never downgrade a closed payment to authorized
      }
      break;

    case 'rejected':
      console.log(`Payment rejected: ${id}`);
      // TODO: cancel the order
      break;

    case 'expired':
      console.log(`Payment expired: ${id}`);
      // TODO: cancel the order
      break;

    default:
      console.log(`Unhandled payment status: ${status}`);
  }
}

// Dispute webhooks carry dispute_id and a dispute status.
function handleDispute(dispute) {
  const { dispute_id: disputeId, payment_id: paymentId, status } = dispute;

  switch (status) {
    case 'pending':
      console.log(`Dispute opened: ${disputeId} on payment ${paymentId}`);
      // TODO: fetch the dispute and gather evidence
      break;

    case 'arbitration':
      console.log(`Dispute in arbitration: ${disputeId}`);
      break;

    case 'evidence_merchant':
      console.log(`Dispute evidence requested: ${disputeId}`);
      // TODO: provide supporting evidence
      break;

    case 'approved':
      console.log(`Dispute approved: ${disputeId}`);
      // TODO: record the refund to the customer
      break;

    case 'declined':
      console.log(`Dispute declined: ${disputeId}`);
      break;

    case 'cancelled':
      console.log(`Dispute cancelled: ${disputeId}`);
      break;

    default:
      console.log(`Unhandled dispute status: ${status}`);
  }
}

function handleEvent(payload) {
  if (payload.dispute_id) handleDispute(payload);
  else handlePayment(payload);
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/tabby', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyTabbyRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Tabby auth header' });
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
    console.error('Error handling Tabby event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  // Tabby treats anything other than 200 as a delivery error and retries.
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyTabbyRequest = verifyTabbyRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/tabby`);
  });
}
