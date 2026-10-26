// Generated with: belvo-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Belvo does not sign payloads. The only authentication is the optional static
 * `Authorization` header you configured on the webhook ("Bearer <token>" or
 * "Basic <base64>"). Compare the WHOLE header value, scheme prefix included;
 * don't strip or parse it. This proves who sent the request, not that the body
 * is untampered, and gives no replay protection.
 */
function verifyBelvoRequest(headers, config = process.env) {
  const expected = config.BELVO_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers['authorization'];
  if (!received) return false;
  return safeEqual(received, expected);
}

/**
 * Belvo body shapes, told apart by the fields present:
 * - Payments Mexico: eventType/eventCode/details
 * - Payments Brazil V2 (resources created with X-Belvo-API-Resource-Version: Payments-BR.V2):
 *   schema_version/resource/resource_id
 * - Payments Brazil V1: webhook_type/webhook_code with object_id (no link_id)
 * - Aggregation: webhook_type/webhook_code with link_id
 */
function classify(payload) {
  if (typeof payload.eventCode === 'string') {
    return { family: 'payments_mx', code: payload.eventCode };
  }
  if (typeof payload.schema_version === 'string' && typeof payload.resource === 'string') {
    return { family: 'payments_br_v2', code: payload.resource, id: payload.resource_id };
  }
  if (typeof payload.webhook_code === 'string') {
    const family = 'object_id' in payload && !('link_id' in payload) ? 'payments_br_v1' : 'aggregation';
    return { family, code: payload.webhook_code, type: payload.webhook_type };
  }
  return null;
}

function handlePayments(code, payload) {
  const details = payload.details || {};

  switch (code) {
    case 'payment_request_successful':
      console.log(`Payment request ${details.id} succeeded: ${details.amount}`);
      // TODO: mark the payment as paid
      break;

    case 'payment_request_failed':
      console.log(`Payment request ${details.id} failed: ${details.failedReason}`);
      // TODO: notify the customer and retry or cancel
      break;

    case 'payment_request_chargeback':
      console.log(`Payment request ${details.id} charged back`);
      // TODO: flag the payment and the customer for review
      break;

    case 'consent_submitted':
    case 'consent_confirmed':
    case 'consent_incomplete_information':
    case 'consent_rejected':
      console.log(`Consent ${details.id} (${code}), payment method ${details.paymentMethodId}`);
      // TODO: update the consent state; details.reasons lists files that failed validation
      break;

    case 'payment_method_registration_successful':
    case 'payment_method_registration_failed':
    case 'payment_method_registration_canceled':
      console.log(`Payment method ${details.id}: ${code}`);
      // TODO: activate or discard the payment method
      break;

    case 'customer_blocked':
    case 'customer_unblocked':
      // Sent to every merchant, so the customer may not exist in your system
      console.log(`Customer ${code} for document ${details.documentNumber}`);
      // TODO: check your own customers for this documentNumber
      break;

    case 'withdrawal_created':
      console.log(`Withdrawal ${details.id}: ${details.fromDatetime} to ${details.toDatetime}`);
      // TODO: reconcile the settlement period
      break;

    default:
      console.log(`Unhandled Belvo payments event: ${code}`);
  }
}

function handleAggregation(code, payload) {
  const label = `${payload.webhook_type} ${code} (link ${payload.link_id})`;
  const errors = payload.data && payload.data.errors;

  if (Array.isArray(errors) && errors.length > 0) {
    console.log(`Belvo aggregation error for ${label}: ${errors[0].code}`);
    // TODO: surface the error; operational_limits_reached means retry later
    return;
  }

  switch (code) {
    case 'historical_update':
    case 'new_accounts_available':
    case 'new_transactions_available':
    case 'transactions_updated':
    case 'transactions_deleted':
      console.log(`Belvo data ready: ${label}`);
      // TODO: fetch the new data for this link_id from the Belvo API
      break;

    case 'invalid_credentials':
    case 'token_required':
      console.log(`Belvo link needs the user to act: ${label}`);
      // TODO: ask the user to update the link
      break;

    case 'link_deleted':
      console.log(`Belvo link deleted: ${label}`);
      // TODO: remove the stored link
      break;

    default:
      console.log(`Unhandled Belvo aggregation event: ${label}`);
  }
}

function handlePaymentsBrazil(kind, payload) {
  // Brazil webhooks only identify the resource: fetch it from
  // GET /payments/br/{resource}/{id}/ (V2: send X-Belvo-API-Resource-Version: Payments-BR.V2).
  if (kind.family === 'payments_br_v2') {
    console.log(`Belvo Brazil ${kind.code} ${kind.id} updated at ${payload.timestamp}`);
  } else {
    const data = payload.data || {};
    console.log(`Belvo Brazil ${kind.type} ${kind.code} for ${payload.object_id}: ${data.status}`);
  }
  // TODO: fetch the resource and update your records
}

function handleEvent(payload) {
  const kind = classify(payload);
  if (!kind) {
    console.log('Unhandled Belvo payload (no eventCode, resource or webhook_code)');
  } else if (kind.family === 'payments_mx') {
    handlePayments(kind.code, payload);
  } else if (kind.family === 'payments_br_v1' || kind.family === 'payments_br_v2') {
    handlePaymentsBrazil(kind, payload);
  } else {
    handleAggregation(kind.code, payload);
  }
}

// Read the body raw so the request is authenticated before anything is parsed,
// whatever Content-Type Belvo uses.
app.post('/webhooks/belvo', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyBelvoRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing Authorization header' });
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
    console.error('Error handling Belvo webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyBelvoRequest = verifyBelvoRequest;
module.exports.classify = classify;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/belvo`);
  });
}
