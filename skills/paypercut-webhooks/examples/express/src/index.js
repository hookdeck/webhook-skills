// Generated with: paypercut-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Paypercut's docs don't name the HTTP method, so accept all the usual ones.
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

// In-memory dedupe for the demo. Use Redis or your database in production.
const processedDeliveryIds = new Set();

/**
 * Parse `Paypercut-Signature: t=<unix seconds>,v1=<hex>[,v1=<hex>...]`.
 * Returns the t value exactly as sent (a string) and every v1 entry; other keys (v0...) are ignored.
 */
function parseSignatureHeader(header) {
  if (typeof header !== 'string') return null;
  let t = null;
  const v1 = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === 't' && t === null) t = value;
    else if (key === 'v1') v1.push(value);
  }
  if (!t || v1.length === 0) return null;
  return { t, v1 };
}

/** PAYPERCUT_WEBHOOK_TOLERANCE_SECONDS: unset, empty or 0 = no window. */
function toleranceFromEnv() {
  const n = Number(process.env.PAYPERCUT_WEBHOOK_TOLERANCE_SECONDS);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Verify a Paypercut delivery. HMAC-SHA256 (hex) over `${t}.${rawBody}`, keyed with the
 * endpoint secret's UTF-8 bytes. `t` is used exactly as it appears in the header, and the
 * body stays raw bytes (never decoded or re-serialised).
 *
 * @param {Buffer} rawBody - exact request bytes (empty Buffer when there is no body)
 * @param {string|undefined} header - Paypercut-Signature header value
 * @param {string} secret - the endpoint's signing secret
 * @param {number} toleranceSeconds - opt-in replay window; 0 = off
 */
function verifyPaypercutSignature(
  rawBody,
  header,
  secret = process.env.PAYPERCUT_WEBHOOK_SECRET,
  toleranceSeconds = toleranceFromEnv()
) {
  if (!secret || !Buffer.isBuffer(rawBody)) return false;
  const parsed = parseSignatureHeader(header);
  if (!parsed) return false;

  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(parsed.t)) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(parsed.t)) > toleranceSeconds) return false;
  }

  const expected = Buffer.from(
    crypto
      .createHmac('sha256', Buffer.from(secret, 'utf8'))
      .update(Buffer.concat([Buffer.from(`${parsed.t}.`, 'utf8'), rawBody]))
      .digest('hex'),
    'utf8'
  );

  // Accept if ANY v1 entry matches (key rotation). Validate the format first (exactly 64 hex
  // characters, compared case-insensitively), then compare equal-length buffers in constant time.
  let ok = false;
  for (const candidate of parsed.v1) {
    if (!/^[0-9a-fA-F]{64}$/.test(candidate)) continue;
    if (crypto.timingSafeEqual(Buffer.from(candidate.toLowerCase(), 'utf8'), expected)) ok = true;
  }
  return ok;
}

function handleEvent(event) {
  // Envelope: { type, data, account? } (`account` identifies a connected account)
  const { type, data, account } = event;
  const id = data && typeof data === 'object' ? data.id : undefined;
  const scope = account ? ` (connected account ${account})` : '';

  switch (type) {
    case 'checkout_session.completed':
      console.log(`Checkout session completed: ${id}${scope}`);
      // TODO: fulfil the order
      break;

    case 'payment.succeeded':
      console.log(`Payment succeeded: ${id}${scope}`);
      // TODO: mark the payment as paid
      break;

    case 'payment.failed':
      console.log(`Payment failed: ${id}${scope}`);
      // TODO: notify the customer / retry
      break;

    case 'payment_intent.authorized':
      console.log(`Payment intent authorized: ${id}${scope}`);
      // TODO: capture when ready
      break;

    case 'payment_intent.captured':
      console.log(`Payment intent captured: ${id}${scope}`);
      // TODO: record the captured funds
      break;

    case 'payout.paid':
      console.log(`Payout paid: ${id}${scope}`);
      // TODO: reconcile the payout
      break;

    case 'payout.failed':
      console.log(`Payout failed: ${id}${scope}`);
      // TODO: alert finance
      break;

    case 'account.updated':
      console.log(`Account updated: ${id}${scope}`);
      // TODO: refresh the connected account's status
      break;

    case 'invoice.paid':
      console.log(`Invoice paid: ${id}${scope}`);
      // TODO: extend the subscription
      break;

    case 'invoice.payment_failed':
      console.log(`Invoice payment failed: ${id}${scope}`);
      // TODO: start dunning
      break;

    case 'identity.verification_session.verified':
      console.log(`Identity verification verified: ${id}${scope}`);
      // TODO: unlock the verified user
      break;

    default:
      console.log(`Unhandled Paypercut event: ${type}`);
  }
}

// Read the body raw (any content type) so the exact bytes are verified before parsing.
app.all('/webhooks/paypercut', express.raw({ type: '*/*' }), (req, res) => {
  if (!process.env.PAYPERCUT_WEBHOOK_SECRET) {
    console.error('Set PAYPERCUT_WEBHOOK_SECRET');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  // With no body, express.raw leaves req.body as {}: verify over zero bytes.
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  // Signature first, for every method.
  if (!verifyPaypercutSignature(rawBody, req.headers['paypercut-signature'])) {
    return res.status(401).json({ error: 'Invalid or missing Paypercut-Signature' });
  }

  if (!ALLOWED_METHODS.includes(req.method)) {
    res.set('Allow', ALLOWED_METHODS.join(', '));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // A verified request with no body (for example GET) is acknowledged.
  if (rawBody.length === 0) {
    return res.status(200).json({ received: true });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string') {
    return res.status(400).json({ error: 'Invalid event type format' });
  }

  // Dedupe on Paypercut-Delivery-Id, recorded only after the event is handled.
  const deliveryId = req.headers['paypercut-delivery-id'];
  if (deliveryId && processedDeliveryIds.has(deliveryId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling Paypercut event:', err);
    return res.status(500).json({ error: 'Handler error' }); // Paypercut retries on 500
  }

  if (deliveryId) processedDeliveryIds.add(deliveryId);
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyPaypercutSignature = verifyPaypercutSignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/paypercut`);
  });
}
