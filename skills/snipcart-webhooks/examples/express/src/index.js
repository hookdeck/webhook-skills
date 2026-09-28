// Generated with: snipcart-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * SNIPCART DOES NOT SIGN WEBHOOKS.
 *
 * There is no signature header, no HMAC, no shared webhook secret and no
 * timestamp header. Every outbound request instead carries a random token in
 * `X-Snipcart-RequestToken`, valid for one hour, which you prove
 * genuine by calling Snipcart's API with your SECRET API key:
 *
 *   GET https://app.snipcart.com/api/requestvalidation/{token}
 *   Authorization: Basic base64(SNIPCART_SECRET_API_KEY + ":")
 *
 *   200 -> genuine
 *   404 -> unknown, already validated, or expired
 *   401/403 -> your secret key is wrong, missing, or in the wrong mode
 *
 * Verification is therefore a NETWORK CALL, not a local computation. It is done
 * with global fetch (Node 18+) so tests can stub it; there is no official
 * Snipcart SDK for webhook validation.
 */

const VALIDATION_ENDPOINT = 'https://app.snipcart.com/api/requestvalidation';

/**
 * The token is attacker-controlled and gets interpolated into the URL path of a
 * request that carries the store's SECRET key. Format-check it BEFORE it
 * reaches the URL.
 *
 * encodeURIComponent is NOT enough: it leaves `.` and `..` intact and the URL
 * parser resolves them as dot segments, so a token of `..` would turn the call
 * into `GET https://app.snipcart.com/api/` — whose 200 would be misread as "the
 * token is genuine". Observed tokens are UUIDs.
 */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

const VALIDATION_TIMEOUT_MS = Number(process.env.SNIPCART_VALIDATION_TIMEOUT_MS) || 5000;

/** Thrown when the secret key is missing. Never fail open — fail loudly. */
class SnipcartConfigurationError extends Error {}

/** `Authorization: Basic base64(key + ":")` — the TRAILING COLON is required. */
function basicAuthHeader(secretKey) {
  return `Basic ${Buffer.from(`${secretKey}:`, 'utf8').toString('base64')}`;
}

/**
 * Validate an `X-Snipcart-RequestToken` against Snipcart's API.
 *
 * Fails closed on every uncertainty: malformed token, 404, 401/403, any other
 * status, a network error or a timeout all return `valid: false`.
 *
 * @param {string|undefined} token  Raw `X-Snipcart-RequestToken` header value
 * @param {{secretKey?: string, timeoutMs?: number}} [options]
 * @returns {Promise<{valid: boolean, reason: string, status?: number}>}
 */
async function validateRequestToken(token, options = {}) {
  const secretKey = options.secretKey ?? process.env.SNIPCART_SECRET_API_KEY;
  const timeoutMs = options.timeoutMs ?? VALIDATION_TIMEOUT_MS;

  if (!secretKey) {
    throw new SnipcartConfigurationError('SNIPCART_SECRET_API_KEY is not set');
  }

  const candidate = typeof token === 'string' ? token.trim() : '';
  if (!candidate) return { valid: false, reason: 'missing_token' };
  // Reject without ever calling Snipcart with a hostile path segment.
  if (!TOKEN_PATTERN.test(candidate)) return { valid: false, reason: 'malformed_token' };

  let response;
  try {
    response = await fetch(`${VALIDATION_ENDPOINT}/${candidate}`, {
      method: 'GET',
      headers: {
        Authorization: basicAuthHeader(secretKey),
        Accept: 'application/json',
      },
      // Never forward the secret key to whatever a redirect points at, and only
      // a DIRECT 200 counts as genuine.
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // Network error or timeout. Log the failure, never the key or the token.
    console.error('Snipcart request validation failed to reach the API:', err.name);
    return { valid: false, reason: 'upstream_unreachable' };
  }

  // Only the status matters; release the connection instead of leaving the
  // body unread.
  response.body?.cancel().catch(() => undefined);

  if (response.status === 200) return { valid: true, reason: 'ok', status: 200 };
  if (response.status === 404) {
    // Unknown, already validated, or expired (tokens live one hour).
    return { valid: false, reason: 'unknown_token', status: 404 };
  }
  if (response.status === 401 || response.status === 403) {
    // Configuration problem on our side: wrong/missing secret key, or a key
    // created in the other mode (Test keys cannot read Live data).
    console.error('Snipcart rejected the validation call — check SNIPCART_SECRET_API_KEY and its mode');
    return { valid: false, reason: 'validation_unauthorized', status: response.status };
  }
  // Anything else (5xx, 429 included) is NOT a success. Fail closed.
  console.error(`Snipcart request validation unavailable: HTTP ${response.status}. Failing closed.`);
  return { valid: false, reason: 'upstream_error', status: response.status };
}

/**
 * Express middleware: validate the request token, then hand the raw body on.
 * Nothing downstream runs until Snipcart has confirmed the token.
 */
async function requireSnipcartRequestToken(req, res, next) {
  // Header names are case-insensitive; Node lowercases them. Snipcart has been
  // seen sending `X-Snipcart-Requesttoken` on the wire.
  const token = req.get('X-Snipcart-RequestToken');

  let result;
  try {
    result = await validateRequestToken(token);
  } catch (err) {
    if (err instanceof SnipcartConfigurationError) {
      console.error(err.message);
      return res.status(500).json({ error: 'server_misconfigured' });
    }
    return next(err);
  }

  if (!result.valid) {
    console.warn(`Rejected Snipcart request: ${result.reason}`);
    return res.status(401).json({ error: 'invalid_request_token', reason: result.reason });
  }

  return next();
}

/**
 * Parse the raw body AFTER validation.
 *
 * @returns {object|null} the parsed envelope, or null if the body is unusable
 * (the response has already been sent in that case).
 */
function parseEnvelope(req, res) {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    res.status(400).json({ error: 'invalid_json' });
    return null;
  }
  if (!event || typeof event.eventName !== 'string') {
    res.status(400).json({ error: 'missing_event_name' });
    return null;
  }
  return event;
}

// Raw body for every Snipcart route: parse only after the token checks out.
const rawJson = express.raw({ type: '*/*' });

// ---------------------------------------------------------------------------
// Asynchronous events: order.* and v3/subscription.*
// ---------------------------------------------------------------------------

app.post('/webhooks/snipcart', rawJson, requireSnipcartRequestToken, (req, res) => {
  const event = parseEnvelope(req, res);
  if (!event) return undefined;

  // There is NO event id and NO delivery id in the envelope. For idempotency,
  // key on the order token + eventName (+ createdOn).
  const idempotencyKey = [
    event.eventName,
    event.content?.token || event.content?.orderToken || event.content?.subscription?.id || 'unknown',
    event.createdOn,
  ].join(':');
  console.log(`Snipcart ${event.mode} event ${event.eventName} (${idempotencyKey})`);

  // Snipcart may add new payload fields at any time without notice. Ignore
  // unknown fields — never apply strict schema validation.
  switch (event.eventName) {
    case 'order.completed':
      handleOrderCompleted(event.content);
      break;
    case 'order.status.changed':
      // `from` / `to` are TOP-LEVEL, alongside content, not inside it.
      console.log(`Order ${event.content.token} status ${event.from} -> ${event.to}`);
      break;
    case 'order.paymentStatus.changed':
      console.log(`Order ${event.content.token} payment ${event.from} -> ${event.to}`);
      break;
    case 'order.trackingNumber.changed':
      console.log(`Order ${event.content.token} tracking ${event.trackingNumber} (${event.trackingUrl})`);
      break;
    case 'order.refund.created':
      console.log(`Refund of ${event.content.amount} ${event.content.currency} on ${event.content.orderToken}`);
      break;
    case 'order.notification.created':
      console.log(`Notification ${event.content.notificationType} on ${event.content.orderToken}`);
      break;
    case 'order.withdrawal.created':
      console.log(`Withdrawal ${event.content.id} on order ${event.content.orderToken}`);
      break;

    // The `v3/` prefix is PART OF THE EVENT NAME. Do not strip it.
    // These payment events do NOT fire for the first payment, only recurring ones.
    case 'v3/subscription.invoice.payment.succeeded':
      console.log(`Subscription ${event.content.subscription.id} paid, next ${event.content.subscription.nextBillingDate}`);
      break;
    case 'v3/subscription.invoice.payment.failed':
      console.log(`Subscription ${event.content.subscription.id} payment failed`);
      break;
    case 'v3/subscription.state.cancellationRequested':
      console.log(`Subscription ${event.content.subscription.id} cancellation requested`);
      break;
    case 'v3/subscription.state.cancelled':
      console.log(`Subscription ${event.content.subscription.id} cancelled`);
      break;

    default:
      // New event types can appear. Acknowledge instead of erroring.
      console.log(`Unhandled Snipcart event: ${event.eventName}`);
  }

  // Snipcart requires Content-Type application/json AND status 200.
  return res.status(200).json({ received: true });
});

function handleOrderCompleted(order) {
  console.log(
    `Order ${order.invoiceNumber} (${order.token}) for ${order.email}: ` +
      `${order.finalGrandTotal ?? order.grandTotal} ${order.currency}, ` +
      `${order.items?.length ?? 0} item(s), status ${order.status}/${order.paymentStatus}`
  );
}

// ---------------------------------------------------------------------------
// Synchronous webhooks: the RESPONSE BODY is consumed by Snipcart at checkout.
//
// These are configured in their own dashboard settings (Shipping -> Webhooks,
// Taxes -> Providers -> Webhooks), NOT in the general webhook URL, and they
// must point DIRECTLY at this app: a store-and-forward gateway such as Hookdeck
// cannot synchronously return a destination's response to the client.
// ---------------------------------------------------------------------------

app.post('/webhooks/snipcart/shipping-rates', rawJson, requireSnipcartRequestToken, (req, res) => {
  const event = parseEnvelope(req, res);
  if (!event) return undefined;

  // content is the current ORDER for shippingrates.fetch. The documented
  // shippingrates.fetch example uses FLAT address fields
  // (`shippingAddressCountry`, `shippingAddressPostalCode`, ...), unlike the
  // nested `shippingAddress` object on order events — read both.
  const order = event.content || {};
  const country = order.shippingAddressCountry ?? order.shippingAddress?.country;

  if (!country) {
    // Customer-facing error: still a 2XX, with an `errors` array.
    return res.status(200).json({
      errors: [{ key: 'invalid_shipping_address', message: 'A shipping country is required.' }],
    });
  }

  // Trivial illustrative calculation — replace with your carrier logic.
  const weight = Number(order.totalWeight) || 0;
  const base = country === 'US' ? 10 : 25;
  const cost = Math.round((base + weight * 0.01) * 100) / 100;

  // `cost` and `description` are required. `userDefinedId` must be unique and
  // ends up on the order as `shippingRateUserDefinedId`.
  return res.status(200).json({
    rates: [
      {
        cost,
        description: 'Standard shipping',
        userDefinedId: 'standard',
        guaranteedDaysToDelivery: 5,
      },
      {
        cost: Math.round(cost * 2 * 100) / 100,
        description: 'Express shipping',
        userDefinedId: 'express',
        guaranteedDaysToDelivery: 2,
      },
    ],
  });
});

app.post('/webhooks/snipcart/taxes', rawJson, requireSnipcartRequestToken, (req, res) => {
  const event = parseEnvelope(req, res);
  if (!event) return undefined;

  // content is the live CART for taxes.calculate (not an order). Dates inside
  // it are Unix timestamps, not ISO strings, and `paymentMethod` is a number.
  const cart = event.content || {};
  const taxableBase = (cart.items || []).reduce(
    (sum, item) => sum + (Number(item.totalPrice) || 0),
    0
  );

  // Trivial illustrative calculation — replace with your tax engine.
  const rate = 0.05;
  const amount = Math.round(taxableBase * rate * 100) / 100;

  // `name` and `amount` are required. `amount` is in CURRENCY UNITS, not cents.
  return res.status(200).json({
    taxes: [
      {
        name: 'Sales tax',
        amount,
        rate,
        numberForInvoice: 'TAX-001',
      },
    ],
  });
});

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Snipcart webhook receiver listening on http://localhost:${PORT}`);
    console.log(`  async events        POST /webhooks/snipcart`);
    console.log(`  shippingrates.fetch POST /webhooks/snipcart/shipping-rates`);
    console.log(`  taxes.calculate     POST /webhooks/snipcart/taxes`);
  });
}

module.exports = {
  app,
  validateRequestToken,
  requireSnipcartRequestToken,
  basicAuthHeader,
  SnipcartConfigurationError,
  VALIDATION_ENDPOINT,
  TOKEN_PATTERN,
};
