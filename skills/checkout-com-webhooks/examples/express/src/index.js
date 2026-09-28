// Generated with: checkout-com-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * CHECKOUT.COM WEBHOOK VERIFICATION
 *
 * Two INDEPENDENT, OPTIONAL mechanisms are configured per webhook (Dashboard ->
 * Developers -> Webhooks, or the `webhook` action on POST /workflows). Check
 * whichever you have a value for.
 *
 *   1. Cko-Signature  (PRIMARY — the only one that proves body integrity)
 *      header : Cko-Signature
 *      value  : HMAC-SHA256(raw body) keyed with the webhook SIGNATURE KEY,
 *               HEX-encoded (Base16). A BARE digest: no `sha256=` prefix, no
 *               `t=`/timestamp, no version tag, exactly ONE signature.
 *      key    : used AS-IS as a UTF-8 string. NOT base64/hex-decoded, and NOT
 *               your sk_... secret API key on the current platform.
 *
 *   2. Authorization  (OPTIONAL — a static shared key, NOT a signature)
 *      header : Authorization
 *      value  : the configured key VERBATIM. Checkout.com adds NO "Bearer "
 *               prefix. It proves the sender knows the key; it says nothing
 *               about whether the body was modified.
 *
 * THERE IS NO TIMESTAMP. No Cko-Timestamp header exists and no timestamp is
 * signed, so there is nothing to build a replay window from. Do NOT add a
 * tolerance check — replay protection is deduplication on the event id.
 *
 * Checkout.com's official SDKs manage workflows but ship NO webhook-signature
 * verify helper, so this is a manual HMAC with node:crypto by necessity.
 */

/**
 * Verify the Cko-Signature header.
 *
 * @param {Buffer|string} rawBody      RAW, unparsed request body
 * @param {string|undefined} signatureHeader  The Cko-Signature header value
 * @param {string|undefined} signatureKey     CHECKOUT_WEBHOOK_SIGNATURE_KEY
 * @returns {boolean}
 */
function verifyCkoSignature(rawBody, signatureHeader, signatureKey) {
  // Fail closed: a missing header or an unconfigured key is a rejection.
  if (!signatureHeader || !signatureKey) return false;

  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');

  // HMAC over the RAW BODY BYTES. Checkout.com: "perform the signature
  // calculation based on the raw payload body from the HTTP request" — a
  // deserialize/re-serialize round trip can change number precision and mangle
  // special characters (©, ®, ™), and the digest then never matches.
  const expected = crypto
    .createHmac('sha256', signatureKey) // key AS-IS as UTF-8 — do NOT decode it
    .update(body)
    .digest('hex'); // HEX (Base16), not base64

  // Checkout.com's own WooCommerce plugin compares lowercase hex with ===, so
  // lowercase the received value before comparing.
  return timingSafeCompare(String(signatureHeader).trim().toLowerCase(), expected);
}

/**
 * Verify the optional static Authorization key.
 *
 * Returns true when no key is configured — this mechanism is opt-in per
 * webhook, and Cko-Signature is what actually protects the body.
 *
 * @param {string|undefined} header       The Authorization header value
 * @param {string|undefined} expectedKey  CHECKOUT_WEBHOOK_AUTHORIZATION_KEY
 * @returns {boolean}
 */
function verifyAuthorizationKey(header, expectedKey) {
  if (!expectedKey) return true; // not configured for this webhook
  // Compare the WHOLE header value — Checkout.com sends the key verbatim, with
  // no "Bearer " / "Basic " prefix to strip.
  return timingSafeCompare(String(header || ''), expectedKey);
}

/** Constant-time compare with the length guard timingSafeEqual requires. */
function timingSafeCompare(a, b) {
  const left = Buffer.from(String(a), 'utf8');
  const right = Buffer.from(String(b), 'utf8');
  // Length FIRST — timingSafeEqual THROWS on mismatched lengths, and an
  // uncaught throw becomes a 500 that Checkout.com retries eight times.
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

/**
 * Checkout.com webhook endpoint.
 *
 * express.raw() hands the handler a Buffer of the exact bytes Checkout.com
 * sent. NEVER mount express.json() ahead of this route — it consumes the
 * stream and leaves you with a parsed object you cannot re-serialize byte for
 * byte, which is the most common cause of a failing Cko-Signature.
 */
app.post('/webhooks/checkout-com', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = req.body;

  if (!Buffer.isBuffer(rawBody)) {
    console.error('Raw body missing — is express.json() mounted before this route?');
    return res.status(400).json({ error: 'Raw body unavailable' });
  }

  // Node lowercases incoming header names; Checkout.com sends "Cko-Signature".
  const signatureHeader = req.headers['cko-signature'];
  const authorizationHeader = req.headers['authorization'];

  const signatureKey = process.env.CHECKOUT_WEBHOOK_SIGNATURE_KEY;
  const authorizationKey = process.env.CHECKOUT_WEBHOOK_AUTHORIZATION_KEY;

  // FAIL CLOSED on misconfiguration. 500 (not 401) so an operator can tell
  // "my server is misconfigured" apart from "someone sent a bad signature".
  if (!signatureKey) {
    console.error(
      'CHECKOUT_WEBHOOK_SIGNATURE_KEY is not set — refusing to accept unverified webhooks'
    );
    return res.status(500).json({ error: 'Webhook signature key not configured' });
  }

  if (!signatureHeader) {
    // Checkout.com sends no unsigned requests once a signature key is
    // configured. There is NO handshake, NO challenge and NO special test
    // envelope — an unsigned request is not one you should trust.
    console.error('Missing Cko-Signature header');
    return res.status(401).json({ error: 'Missing Cko-Signature header' });
  }

  // Check the optional static key first — it is the cheaper test.
  if (!verifyAuthorizationKey(authorizationHeader, authorizationKey)) {
    console.error('Checkout.com webhook Authorization key mismatch');
    return res.status(401).json({ error: 'Invalid Authorization key' });
  }

  if (!verifyCkoSignature(rawBody, signatureHeader, signatureKey)) {
    console.error('Checkout.com webhook signature verification failed');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Verified — only now is it safe to parse.
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    console.error('Verified request had an unparseable body:', err.message);
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  /**
   * IDEMPOTENCY KEY.
   *
   * The envelope `id` (evt_...) is all there is — Checkout.com sends no
   * per-delivery id header. Delivery is AT-LEAST-ONCE, and because no timestamp
   * is signed, a byte-for-byte replay carries a genuinely valid signature.
   * Deduplication on this id is therefore your ONLY replay protection.
   *
   * Retain processed ids for AT LEAST 31 hours: retries run 5m, 10m, 15m, 30m,
   * 1h, 4h, 12h, 12h after each previous attempt (~30 hours total). That is a
   * floor, not a ceiling — manual resends can come later, so longer is safer.
   */
  const eventId = event.id;

  // THE TIMESTAMP FIELD NAME VARIES BY EVENT. payment_approved and
  // dispute_received carry `created_on`; payment_captured carries `timestamp`.
  const occurredAt = event.created_on ?? event.timestamp;

  console.log(`✓ Verified Checkout.com webhook: ${event.type} (${eventId}) at ${occurredAt}`);

  // Acknowledge within Checkout.com's 10-second budget, then work
  // asynchronously. "Your webhook server must acknowledge every webhook it
  // receives within 10 seconds."
  res.status(200).json({ received: true });

  setImmediate(() => {
    try {
      handleEvent(event);
    } catch (err) {
      console.error(`Error handling Checkout.com event ${eventId}:`, err);
    }
  });
});

/**
 * Format a Checkout.com amount for logging.
 *
 * `amount` is in the MINOR CURRENCY UNIT: {"amount": 20, "currency": "USD"} is
 * $0.20, not $20. This assumes a two-decimal currency; zero-decimal (JPY, KRW)
 * and three-decimal (BHD, KWD, TND) currencies have different exponents, so use
 * the currency's real exponent if you handle more than one.
 */
function formatAmount(amount, currency) {
  if (typeof amount !== 'number') return 'n/a';
  return `${(amount / 100).toFixed(2)} ${currency || ''}`.trim();
}

function handleEvent(event) {
  // TODO: check event.id against your store and return early if seen.
  //   if (await store.has(event.id)) return;

  const data = event.data || {};

  /**
   * ORDERING IS NOT GUARANTEED. Checkout.com: "Checkout.com guarantees to send
   * webhooks at least once, but the order in which we send them may vary."
   * payment_captured CAN arrive before payment_approved. Make each handler
   * independently correct (upsert state) rather than requiring a predecessor,
   * and ignore transitions that would move an order backwards.
   */

  switch (event.type) {
    // --- Gateway: payment lifecycle -----------------------------------------
    case 'payment_approved':
      // data.id is the payment (pay_...), data.action_id the action (act_...).
      console.log(
        `✅ Payment approved: ${data.id} ${formatAmount(data.amount, data.currency)} ` +
          `(ref ${data.reference}, ${data.response_summary})`
      );
      break;
    case 'payment_declined':
      console.log(
        `❌ Payment declined: ${data.id} (${data.response_code} ${data.response_summary})`
      );
      break;
    case 'payment_pending':
      console.log(`⏳ Payment pending: ${data.id}`);
      break;
    case 'payment_paid':
      // Checkout.com: "Occurs when a bank payout is completed successfully."
      console.log(`💰 Payment paid: ${data.id} ${formatAmount(data.amount, data.currency)}`);
      break;
    case 'payment_expired':
      console.log(`⌛ APM payment expired: ${data.id}`);
      break;
    case 'payment_canceled':
      console.log(`🚫 Payment canceled: ${data.id}`);
      break;
    case 'payment_returned':
      console.log(`↩️  Payment returned: ${data.id}`);
      break;

    // --- Gateway: capture ---------------------------------------------------
    case 'payment_captured':
      // Fulfil here, not on payment_approved — approval only holds the funds.
      console.log(
        `📦 Payment captured: ${data.id} ${formatAmount(data.amount, data.currency)} — fulfil the order`
      );
      break;
    case 'payment_capture_declined':
      console.log(`⚠️  Capture declined: ${data.id}`);
      break;
    case 'payment_capture_pending':
      console.log(`⏳ Capture pending: ${data.id}`);
      break;

    // --- Gateway: refund ----------------------------------------------------
    case 'payment_refunded':
      console.log(
        `💸 Payment refunded: ${data.id} ${formatAmount(data.amount, data.currency)}`
      );
      break;
    case 'payment_refund_declined':
      console.log(`⚠️  Refund declined: ${data.id}`);
      break;
    case 'payment_refund_pending':
      console.log(`⏳ Refund pending: ${data.id}`);
      break;

    // --- Gateway: void ------------------------------------------------------
    case 'payment_voided':
      console.log(`🗑️  Payment voided: ${data.id}`);
      break;
    case 'payment_void_declined':
      console.log(`⚠️  Void declined: ${data.id}`);
      break;

    // --- Gateway: authorization increments ----------------------------------
    case 'payment_authorization_incremented':
      console.log(
        `⬆️  Authorization incremented: ${data.id} to ${formatAmount(data.amount, data.currency)}`
      );
      break;
    case 'payment_authorization_increment_declined':
      console.log(`⚠️  Authorization increment declined: ${data.id}`);
      break;

    // --- Gateway: card verification (zero-auth) ------------------------------
    case 'card_verified':
      console.log(`💳 Card verified: ${data.id}`);
      break;
    case 'card_verification_declined':
      console.log(`⚠️  Card verification declined: ${data.id}`);
      break;

    // --- Disputes -----------------------------------------------------------
    // For dispute events data.id is the DISPUTE (dsp_...) and data.payment_id
    // points at the payment being disputed.
    case 'dispute_received':
      console.log(
        `⚖️  Dispute received: ${data.id} on payment ${data.payment_id} ` +
          `(${formatAmount(data.amount, data.currency)}) — gather evidence`
      );
      break;
    case 'dispute_evidence_required':
      console.log(`📄 Evidence required for dispute ${data.id}`);
      break;
    case 'dispute_evidence_submitted':
      console.log(`📤 Evidence submitted for dispute ${data.id}`);
      break;
    case 'dispute_accepted':
      console.log(`🤝 Dispute accepted: ${data.id}`);
      break;
    case 'dispute_won':
      console.log(`🏆 Dispute won: ${data.id}`);
      break;
    case 'dispute_lost':
      console.log(`💔 Dispute lost: ${data.id}`);
      break;
    case 'dispute_expired':
      console.log(`⌛ Dispute expired: ${data.id}`);
      break;
    case 'dispute_canceled':
      console.log(`🚫 Dispute canceled: ${data.id}`);
      break;
    case 'dispute_resolved':
      console.log(`✔️  Dispute resolved: ${data.id}`);
      break;

    // --- Fraud --------------------------------------------------------------
    case 'fraud_reported':
      // The payment is nested at data.payment.id (its amount is an object,
      // {currency, value}, not a minor-unit number).
      console.log(`🚨 Fraud reported on payment ${data.payment && data.payment.id}`);
      break;

    // --- Authentication (3DS) -----------------------------------------------
    case 'authentication_approved':
      // Authentication events carry no data.id: use session_id (sid_…) and
      // payment_id (pay_…).
      console.log(`🔐 3DS authentication approved: ${data.session_id} (payment ${data.payment_id})`);
      break;
    case 'authentication_failed':
      console.log(`🔓 3DS authentication failed: ${data.session_id} (payment ${data.payment_id})`);
      break;

    default:
      // 140+ event types exist across Balances, Compliance, Identities,
      // Issuing, Network tokens, Platforms, Real-Time Account Updater,
      // Reports and Settlements.
      // Log unknown types rather than guessing their shape.
      console.log(`ℹ️  Unhandled Checkout.com event type: ${event.type}`);
  }
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server (skipped during tests)
let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`Checkout.com webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/checkout-com`);
    if (!process.env.CHECKOUT_WEBHOOK_SIGNATURE_KEY) {
      console.warn('⚠️  CHECKOUT_WEBHOOK_SIGNATURE_KEY is not set');
      console.warn('   Every delivery will be rejected until you set it');
    }
  });
}

module.exports = {
  app,
  server,
  verifyCkoSignature,
  verifyAuthorizationKey,
  formatAmount,
};
