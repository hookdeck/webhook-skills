// Generated with: metronome-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Metronome retries and Hookdeck replays resend the original X-Metronome-Date, and
// Hookdeck applies no tolerance itself, so the window is OFF unless you opt in.
function toleranceSeconds() {
  const n = Number(process.env.METRONOME_WEBHOOK_TOLERANCE_SECONDS);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Metronome may deliver an event more than once: dedupe on the body's `id`.
// In-memory for the example; use a shared store (Redis, a DB unique key) in production.
const seenEventIds = new Set();

/**
 * The exact bytes Metronome signs: `{X-Metronome-Date}` + LF (0x0A) + raw body.
 * Built as bytes: the header as latin1 (as received, never trimmed or reformatted),
 * the body untouched. Never decode and re-encode the body.
 */
function buildSignedBytes(rawBody, dateHeader) {
  return Buffer.concat([
    Buffer.from(dateHeader, 'latin1'),
    Buffer.from('\n', 'utf8'),
    rawBody,
  ]);
}

function computeMetronomeSignature(rawBody, dateHeader, secret) {
  return crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8')) // secret is used as-is, not decoded
    .update(buildSignedBytes(rawBody, dateHeader))
    .digest('hex');
}

/**
 * Verify Metronome-Webhook-Signature: bare hex HMAC-SHA256, no prefix.
 * @param {Buffer|string} rawBody  Raw request bytes (Buffer from express.raw)
 */
function verifyMetronomeSignature(rawBody, signatureHeader, dateHeader, secret) {
  if (!signatureHeader || !dateHeader || !secret) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');

  // Validate the format before decoding: exactly 64 hex chars (case-insensitive)
  if (!/^[0-9a-fA-F]{64}$/.test(signatureHeader)) return false;

  const expected = Buffer.from(computeMetronomeSignature(body, dateHeader, secret), 'hex');
  const provided = Buffer.from(signatureHeader.toLowerCase(), 'hex');
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

// X-Metronome-Date is an HTTP date, e.g. 'Mon, 02 Jan 2006 22:04:05 GMT'
function isDateWithinTolerance(dateHeader, tolerance = toleranceSeconds(), now = Date.now()) {
  if (!tolerance) return true;
  const sent = Date.parse(dateHeader);
  if (Number.isNaN(sent)) return false;
  return Math.abs(now - sent) / 1000 <= tolerance;
}

// Metronome endpoint: raw bytes for any content type, parse only after verification
app.post('/webhooks/metronome', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.headers['metronome-webhook-signature'];
  // Use X-Metronome-Date, never Date (intermediaries may rewrite Date)
  const dateHeader = req.headers['x-metronome-date'];
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyMetronomeSignature(rawBody, signature, dateHeader, process.env.METRONOME_WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }

  if (!isDateWithinTolerance(dateHeader)) {
    return res.status(401).send('X-Metronome-Date outside tolerance');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  if (event.id) {
    if (seenEventIds.has(event.id)) {
      return res.json({ received: true, duplicate: true });
    }
    seenEventIds.add(event.id);
  }

  // Threshold, invoice and integration events nest data under `properties`;
  // contract, commit, credit and subscription events are flat.
  const data = event.properties ?? event;

  switch (event.type) {
    case 'alerts.spend_threshold_reached':
      console.log('Spend threshold reached:', data.customer_id, data.current_spend);
      // TODO: Notify the customer or throttle
      break;
    case 'alerts.low_remaining_credit_balance_reached':
      console.log('Low credit balance:', data.customer_id, data.remaining_balance);
      // TODO: Trigger a top-up
      break;
    case 'alerts.low_remaining_commit_balance_reached':
      console.log('Low commit balance:', data.customer_id);
      // TODO: Alert the account owner
      break;
    case 'alerts.usage_threshold_reached':
      console.log('Usage threshold reached:', data.customer_id);
      // TODO: Notify the customer
      break;
    case 'alerts.invoice_total_reached':
      console.log('Invoice total reached:', data.customer_id);
      // TODO: Flag the invoice for review
      break;
    case 'contract.create':
      console.log('Contract created:', data.contract_id);
      // TODO: Provision the customer
      break;
    case 'contract.start':
      console.log('Contract started:', data.contract_id);
      break;
    case 'contract.edit':
      console.log('Contract edited:', data.contract_id);
      break;
    case 'contract.end':
      console.log('Contract ended:', data.contract_id);
      // TODO: Revoke entitlements
      break;
    case 'contract.archive':
      console.log('Contract archived:', data.contract_id);
      break;
    case 'commit.create':
      console.log('Commit created:', data.commit_id);
      break;
    case 'credit.create':
      console.log('Credit created:', data.credit_id);
      break;
    case 'invoice.finalized':
      console.log('Invoice finalized:', data.invoice_id);
      // TODO: Record the receivable
      break;
    case 'invoice.void':
      console.log('Invoice voided:', data.invoice_id);
      break;
    case 'invoice.billing_provider_error':
      console.log('Billing provider error:', data.invoice_id, data.billing_provider_error);
      // TODO: Page whoever owns the billing integration
      break;
    case 'subscription.start':
      console.log('Subscription started:', data.subscription_id);
      break;
    case 'subscription.end':
      console.log('Subscription ended:', data.subscription_id);
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = {
  app,
  buildSignedBytes,
  computeMetronomeSignature,
  verifyMetronomeSignature,
  isDateWithinTolerance,
  seenEventIds,
};

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/metronome`);
  });
}
