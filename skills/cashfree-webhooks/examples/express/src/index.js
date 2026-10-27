// Generated with: cashfree-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Cashfree signs Payment Gateway, Payouts V2, Secure ID and PPI webhooks:
//   x-webhook-signature  standard base64 (padded) HMAC-SHA256, no prefix
//   x-webhook-timestamp  timestamp that is part of the signed content
// Signed content: x-webhook-timestamp value, then the raw body, NO separator.
// Key: the client secret as UTF-8 (Partner API key for partner webhooks).
// Legacy Payouts V1 / Cashgram webhooks are form-encoded and use another scheme.
// ---------------------------------------------------------------------------

// 44 characters: 43 base64 characters plus one "=" (a 32-byte digest).
const SIGNATURE_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

/**
 * Verify a Cashfree delivery. Works on bytes: the raw body is never decoded and
 * re-encoded, and the timestamp header is used exactly as received (latin1).
 *
 * @param {Buffer} rawBody - the exact request body bytes
 * @param {object} headers - Node-style (lowercased) headers
 * @param {string} secret - Cashfree client secret
 * @param {number} toleranceSeconds - 0 (default) disables the replay window
 * @returns {{ ok: boolean, error?: string }}
 */
function verifyCashfreeSignature(rawBody, headers, secret, toleranceSeconds = 0) {
  const signature = headers['x-webhook-signature'];
  const timestamp = headers['x-webhook-timestamp'];
  if (!signature || !timestamp) {
    return { ok: false, error: 'Missing x-webhook-signature or x-webhook-timestamp' };
  }
  // Validate format before comparing; the whole header is one digest.
  if (typeof signature !== 'string' || !SIGNATURE_PATTERN.test(signature)) {
    return { ok: false, error: 'Malformed x-webhook-signature' };
  }

  const signedContent = Buffer.concat([Buffer.from(timestamp, 'latin1'), rawBody]);
  const expected = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(signedContent)
    .digest('base64');

  // Both are 44 ASCII characters, so the buffers have equal length.
  const a = Buffer.from(expected, 'latin1');
  const b = Buffer.from(signature, 'latin1');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: 'Signature mismatch' };
  }

  // Opt-in only. Cashfree does not state the timestamp unit, so accept seconds or
  // milliseconds. Retries resend the original timestamp, so this rejects them once old.
  if (toleranceSeconds > 0) {
    const numeric = Number(timestamp);
    if (!Number.isFinite(numeric)) {
      return { ok: false, error: 'Timestamp is not numeric' };
    }
    const seconds = numeric > 1e11 ? numeric / 1000 : numeric;
    if (Math.abs(Date.now() / 1000 - seconds) > toleranceSeconds) {
      return { ok: false, error: 'Timestamp outside tolerance' };
    }
  }
  return { ok: true };
}

// Payment Gateway and Payouts V2 put the event in `type`; Secure ID and PPI use `event_type`.
function eventName(payload) {
  return payload.type || payload.event_type;
}

function handleEvent(payload) {
  const name = eventName(payload);
  const data = payload.data || {};

  switch (name) {
    // --- Payment Gateway (the overview samples abbreviate some names) -------
    case 'PAYMENT_SUCCESS_WEBHOOK':
    case 'PAYMENT_SUCCESS':
      console.log(`Payment succeeded: order ${data.order?.order_id}, payment ${data.payment?.cf_payment_id}`);
      break;
    case 'PAYMENT_FAILED_WEBHOOK':
    case 'PAYMENT_FAILED':
      console.log(`Payment failed: order ${data.order?.order_id}`);
      break;
    case 'PAYMENT_USER_DROPPED_WEBHOOK':
    case 'PAYMENT_USER_DROPPED':
      console.log(`Customer dropped payment: order ${data.order?.order_id}`);
      break;
    case 'REFUND_STATUS_WEBHOOK':
      console.log(`Refund status update: ${data.refund?.refund_id}`);
      break;
    case 'SETTLEMENT_STATUS_WEBHOOK':
      console.log('Settlement status update');
      break;

    // --- Payouts V2 --------------------------------------------------------
    case 'TRANSFER_SUCCESS':
    case 'TRANSFER_FAILED':
    case 'TRANSFER_REVERSED':
      console.log(`${name}: transfer ${data.transfer_id} (${data.status})`);
      break;

    // --- Secure ID (event_type) --------------------------------------------
    case 'BANK_ACCOUNT_VERIFICATION_SUCCESS':
      console.log(`Bank account verified: ${data.reference_id} (${data.account_status})`);
      break;
    case 'VKYC_AUDITOR_REVIEW_COMPLETED':
      console.log(`Video KYC review done: ${data.verification_id} (${data.sub_status})`);
      break;

    // --- PPI (event_type) --------------------------------------------------
    case 'PPI_CREDIT_SUCCESS':
      console.log(`Wallet credit: ${data.credit_id} to ${data.wallet_id}`);
      break;

    default:
      console.log(`Unhandled Cashfree event: ${name}`);
  }
}

// Cashfree treats anything other than HTTP 200 as a failure (3xx included), so
// success answers 200. express.raw({ type: '*/*' }) keeps the exact bytes for any
// content type; express.json() would re-serialise the body and break the signature.
app.post('/webhooks/cashfree', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.CASHFREE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CASHFREE_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const tolerance = Number(process.env.CASHFREE_WEBHOOK_TOLERANCE_SECONDS) || 0;
  const result = verifyCashfreeSignature(rawBody, req.headers, secret, tolerance);
  if (!result.ok) {
    console.error('Cashfree webhook verification failed:', result.error);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Parse only after verification.
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (payload === null || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  try {
    // Delivery is at-least-once and unordered: dedupe on business IDs such as
    // cf_payment_id or transfer_id, and enqueue slow work instead of doing it here.
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Cashfree event:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  return res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`Cashfree webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/cashfree`);
  });
}

module.exports = { app, server, verifyCashfreeSignature };
