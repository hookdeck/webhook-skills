// Generated with: hyperswitch-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// HMAC-SHA512 hex digest = exactly 128 hex characters.
const SIGNATURE_PATTERN = /^[0-9a-fA-F]{128}$/;

/**
 * Verify the X-Webhook-Signature-512 header.
 *
 * Algorithm: HMAC-SHA512, hex digest, no prefix
 * Key:       the business profile's payment_response_hash_key, as UTF-8 bytes
 * Signed:    the raw request body bytes only (no timestamp, id or other header)
 */
function verifyHyperswitchSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader) {
    return { valid: false, error: 'Missing X-Webhook-Signature-512 header' };
  }
  // Validate the format before decoding: Buffer.from(x, 'hex') silently drops
  // bad characters. The whole header value is one digest (no list, no prefix).
  if (!SIGNATURE_PATTERN.test(signatureHeader)) {
    return { valid: false, error: 'Malformed signature' };
  }

  const expected = crypto
    .createHmac('sha512', Buffer.from(secret, 'utf8'))
    .update(rawBody)
    .digest();
  const received = Buffer.from(signatureHeader.toLowerCase(), 'hex');

  // timingSafeEqual throws on unequal lengths, so check first.
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    return { valid: false, error: 'Invalid signature' };
  }
  return { valid: true };
}

// The 33 event_type wire values listed in Hyperswitch's webhook guide.
const KNOWN_EVENT_TYPES = new Set([
  'payment_succeeded', 'payment_failed', 'payment_processing', 'payment_cancelled',
  'payment_cancelled_post_capture', 'payment_authorized', 'payment_partially_authorized',
  'payment_captured', 'payment_expired', 'action_required',
  'refund_succeeded', 'refund_failed', 'refund_review',
  'dispute_opened', 'dispute_expired', 'dispute_accepted', 'dispute_cancelled',
  'dispute_challenged', 'dispute_won', 'dispute_lost',
  'mandate_active', 'mandate_revoked',
  'payout_success', 'payout_failed', 'payout_initiated', 'payout_processing',
  'payout_cancelled', 'payout_expired', 'payout_reversed', 'payout_not_permitted',
  'invoice_paid', 'surcharge_payment_succeeded', 'surcharge_refund_succeeded',
]);

// In-memory dedupe on event_id. Use a shared store (Redis, database) in production.
const processedEventIds = new Set();

/**
 * Dispatch on the top-level `event_type`. `content.type` only names the
 * resource shape (payment_details, refund_details, ...) held in `content.object`.
 */
function handleHyperswitchEvent(event) {
  const object = event.content?.object ?? {};

  switch (event.event_type) {
    case 'payment_succeeded':
      console.log('Payment succeeded:', object.payment_id);
      break;
    case 'payment_failed':
      console.log('Payment failed:', object.payment_id, object.error_message);
      break;
    case 'action_required':
      console.log('Payment needs customer action:', object.payment_id);
      break;
    case 'refund_succeeded':
      console.log('Refund succeeded:', object.refund_id);
      break;
    case 'refund_failed':
      console.log('Refund failed:', object.refund_id);
      break;
    case 'dispute_opened':
      console.log('Dispute opened:', object.dispute_id);
      break;
    default:
      if (KNOWN_EVENT_TYPES.has(event.event_type)) {
        console.log(`Received ${event.event_type} (no specific handler)`);
      } else {
        // Hyperswitch may add events: log and acknowledge.
        console.log(`Unhandled Hyperswitch event_type: ${event.event_type}`);
      }
  }
}

// Read the body as raw bytes for any content type, then parse only after verifying.
app.post('/webhooks/hyperswitch', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.HYPERSWITCH_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed: never accept unverified deliveries.
    console.error('HYPERSWITCH_WEBHOOK_SECRET is not set; rejecting webhook');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const verification = verifyHyperswitchSignature(
    rawBody,
    req.get('x-webhook-signature-512'),
    secret
  );

  if (!verification.valid) {
    console.error('Hyperswitch webhook verification failed:', verification.error);
    return res.status(401).send(`Webhook Error: ${verification.error}`);
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    console.error('Invalid JSON payload:', err.message);
    return res.status(400).send('Invalid JSON payload');
  }
  if (event === null || typeof event !== 'object') {
    return res.status(400).send('Invalid payload');
  }

  // Retries can deliver the same event twice: acknowledge duplicates without re-applying.
  if (event.event_id && processedEventIds.has(event.event_id)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    handleHyperswitchEvent(event);
    if (event.event_id) processedEventIds.add(event.event_id);
  } catch (err) {
    console.error('Error processing Hyperswitch event:', err);
    return res.status(500).send('Processing error');
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyHyperswitchSignature = verifyHyperswitchSignature;
module.exports.handleHyperswitchEvent = handleHyperswitchEvent;
module.exports.KNOWN_EVENT_TYPES = KNOWN_EVENT_TYPES;
module.exports.processedEventIds = processedEventIds;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/hyperswitch`);
  });
}
