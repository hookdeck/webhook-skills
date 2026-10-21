// Generated with: revenuecat-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// RevenueCat re-signs every delivery attempt (including retries), so `t` is
// always recent. 300 seconds only has to cover clock skew and request latency.
const TOLERANCE_SECONDS = 300;

/**
 * Parse X-RevenueCat-Webhook-Signature: "t=<unix seconds>,v1=<hex>".
 * Each field is split on its first "=" only.
 */
function parseSignatureHeader(header) {
  let timestamp;
  let timestampCount = 0;
  const signatures = [];

  for (const field of header.split(',')) {
    const separator = field.indexOf('=');
    if (separator === -1) continue;
    const key = field.slice(0, separator).trim();
    const value = field.slice(separator + 1).trim();
    if (key === 't') {
      timestamp = value;
      timestampCount += 1;
    } else if (key === 'v1' && value) {
      signatures.push(value.toLowerCase());
    }
  }

  return { timestamp, timestampCount, signatures };
}

/**
 * Verify a RevenueCat HMAC webhook signature.
 *
 * Signed content: `${t}.${rawBody}` (raw bytes, not re-serialised JSON)
 * Algorithm:      HMAC-SHA256 keyed with the signing secret (UTF-8), hex digest
 */
function verifyRevenueCatSignature(
  rawBody,
  header,
  secret,
  toleranceSeconds = TOLERANCE_SECONDS,
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  if (!header) {
    return { valid: false, error: 'Missing X-RevenueCat-Webhook-Signature header' };
  }

  const { timestamp, timestampCount, signatures } = parseSignatureHeader(header);
  if (timestampCount !== 1 || !/^[0-9]+$/.test(timestamp) || signatures.length === 0) {
    return { valid: false, error: 'Malformed X-RevenueCat-Webhook-Signature header' };
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');

  const matched = signatures.some(
    (sig) =>
      sig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  );
  if (!matched) {
    return { valid: false, error: 'Invalid signature' };
  }

  // `t` is inside the signed content, so it can't be refreshed on a replay.
  if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) {
    return { valid: false, error: 'Timestamp outside tolerance' };
  }

  return { valid: true };
}

/**
 * Compare the Authorization header with the value configured on the
 * integration. RevenueCat sends that value verbatim on every request.
 * Hash both sides so the comparison is constant time regardless of length.
 */
function verifyAuthorizationHeader(received, expected) {
  if (!received) {
    return { valid: false, error: 'Missing Authorization header' };
  }
  const a = crypto.createHash('sha256').update(received).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b)
    ? { valid: true }
    : { valid: false, error: 'Invalid Authorization header' };
}

function handleEvent(event) {
  switch (event.type) {
    case 'TEST':
      // Sent from the dashboard's "Send test event" button.
      console.log('Test event received:', event.id);
      break;
    case 'INITIAL_PURCHASE':
      console.log(`Initial purchase of ${event.product_id} by ${event.app_user_id}`);
      break;
    case 'RENEWAL':
      console.log(`Renewal of ${event.product_id} by ${event.app_user_id}`);
      break;
    case 'CANCELLATION':
      // Auto-renew turned off or refunded. Access continues until EXPIRATION.
      console.log(`Cancellation for ${event.app_user_id} (reason: ${event.cancel_reason})`);
      break;
    case 'UNCANCELLATION':
      console.log(`Uncancellation for ${event.app_user_id}`);
      break;
    case 'NON_RENEWING_PURCHASE':
      console.log(`Non-renewing purchase of ${event.product_id} by ${event.app_user_id}`);
      break;
    case 'SUBSCRIPTION_PAUSED':
      // Don't revoke access here; wait for EXPIRATION with reason SUBSCRIPTION_PAUSED.
      console.log(`Subscription pause scheduled for ${event.app_user_id}`);
      break;
    case 'EXPIRATION':
      // Revoke access.
      console.log(`Expiration for ${event.app_user_id} (reason: ${event.expiration_reason})`);
      break;
    case 'BILLING_ISSUE':
      // A charge failed; the subscription has not expired yet.
      console.log(`Billing issue for ${event.app_user_id}`);
      break;
    case 'PRODUCT_CHANGE':
      // The new product may not be in effect yet.
      console.log(`Product change for ${event.app_user_id}: ${event.product_id} -> ${event.new_product_id}`);
      break;
    case 'SUBSCRIPTION_EXTENDED':
    case 'REFUND_REVERSED':
    case 'INVOICE_ISSUANCE':
    case 'TRANSFER':
    case 'TEMPORARY_ENTITLEMENT_GRANT':
    case 'VIRTUAL_CURRENCY_TRANSACTION':
    case 'EXPERIMENT_ENROLLMENT':
    case 'PURCHASE_REDEEMED':
    case 'PRICE_INCREASE_CONSENT_REQUIRED':
    case 'PRICE_INCREASE_CONSENT_APPROVED':
      console.log(`${event.type}:`, event.id);
      break;
    default:
      // RevenueCat may add event types without an API version bump. Answer 200
      // so they aren't retried.
      console.log(`Unhandled RevenueCat event type: ${event.type}`);
  }
}

// RevenueCat webhook endpoint. express.raw keeps the exact bytes RevenueCat signed.
app.post('/webhooks/revenuecat', express.raw({ type: 'application/json' }), (req, res) => {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  const expectedAuth = process.env.REVENUECAT_WEBHOOK_AUTH;

  if (!secret && !expectedAuth) {
    console.error('Set REVENUECAT_WEBHOOK_SECRET and/or REVENUECAT_WEBHOOK_AUTH');
    return res.status(500).json({ error: 'Webhook verification not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  // 1. Static Authorization header (when configured on the integration).
  if (expectedAuth) {
    const auth = verifyAuthorizationHeader(req.get('authorization'), expectedAuth);
    if (!auth.valid) {
      console.error('RevenueCat webhook authorization failed:', auth.error);
      return res.status(401).json({ error: auth.error });
    }
  }

  // 2. HMAC signature (when "HMAC webhook signing" is enabled).
  if (secret) {
    const verification = verifyRevenueCatSignature(
      rawBody,
      req.get('x-revenuecat-webhook-signature'),
      secret
    );
    if (!verification.valid) {
      console.error('RevenueCat webhook verification failed:', verification.error);
      return res.status(401).json({ error: verification.error });
    }
  }

  // 3. Parse only after verifying the raw body.
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }
  const event = payload && payload.event;
  if (!event || typeof event.type !== 'string') {
    return res.status(400).json({ error: 'Missing event' });
  }

  // In production: dedupe on event.id (retries reuse it), store the event,
  // return 200, then process asynchronously.
  handleEvent(event);

  // RevenueCat treats any status other than 200 as a failure.
  return res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyRevenueCatSignature = verifyRevenueCatSignature;
module.exports.verifyAuthorizationHeader = verifyAuthorizationHeader;
module.exports.parseSignatureHeader = parseSignatureHeader;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/revenuecat`);
  });
}
