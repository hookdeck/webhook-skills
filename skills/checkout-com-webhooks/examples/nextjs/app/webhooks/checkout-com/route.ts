// Generated with: checkout-com-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

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

/** The Checkout.com event envelope. */
export interface CheckoutEvent {
  /** Event id, prefixed `evt_`. Your idempotency key. */
  id: string;
  /** snake_case event name, e.g. `payment_approved`. Never dotted. */
  type: string;
  /** Event SCHEMA version, e.g. "1.0.29" — not an API version. */
  version?: string;
  /** Present on payment_approved, dispute_received, ... */
  created_on?: string;
  /** Present INSTEAD of created_on on payment_captured, ... */
  timestamp?: string;
  data: {
    /** pay_… for payment events, dsp_… for dispute events. */
    id?: string;
    action_id?: string;
    /** Dispute and authentication events: the related payment (pay_…). */
    payment_id?: string;
    /** fraud_reported: the payment is nested here, with an object amount. */
    payment?: { id?: string; [key: string]: unknown };
    /** Authentication events: the 3DS session (sid_…). They have no data.id. */
    session_id?: string;
    reference?: string;
    /** MINOR currency unit: 20 USD-cents is $0.20. */
    amount?: number;
    currency?: string;
    response_code?: string;
    response_summary?: string;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
  };
  _links?: { self?: { href?: string } };
  source?: unknown;
  action_invocations?: unknown;
}

/**
 * Verify the Cko-Signature header.
 *
 * @param rawBody         RAW, unparsed request body
 * @param signatureHeader The Cko-Signature header value
 * @param signatureKey    CHECKOUT_WEBHOOK_SIGNATURE_KEY
 */
export function verifyCkoSignature(
  rawBody: Buffer | string,
  signatureHeader: string | null | undefined,
  signatureKey: string | undefined
): boolean {
  // Fail closed: a missing header or an unconfigured key is a rejection.
  if (!signatureHeader || !signatureKey) return false;

  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');

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
  return timingSafeCompare(signatureHeader.trim().toLowerCase(), expected);
}

/**
 * Verify the optional static Authorization key.
 *
 * Returns true when no key is configured — this mechanism is opt-in per
 * webhook, and Cko-Signature is what actually protects the body.
 */
export function verifyAuthorizationKey(
  header: string | null | undefined,
  expectedKey: string | undefined
): boolean {
  if (!expectedKey) return true; // not configured for this webhook
  // Compare the WHOLE header value — Checkout.com sends the key verbatim, with
  // no "Bearer " / "Basic " prefix to strip.
  return timingSafeCompare(header ?? '', expectedKey);
}

/** Constant-time compare with the length guard timingSafeEqual requires. */
function timingSafeCompare(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  // Length FIRST — timingSafeEqual THROWS on mismatched lengths, and an
  // uncaught throw becomes a 500 that Checkout.com retries eight times.
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * Format a Checkout.com amount for logging.
 *
 * `amount` is in the MINOR CURRENCY UNIT: {"amount": 20, "currency": "USD"} is
 * $0.20, not $20. This assumes a two-decimal currency; zero-decimal (JPY, KRW)
 * and three-decimal (BHD, KWD, TND) currencies have different exponents.
 */
export function formatAmount(amount: number | undefined, currency: string | undefined): string {
  if (typeof amount !== 'number') return 'n/a';
  return `${(amount / 100).toFixed(2)} ${currency ?? ''}`.trim();
}

export async function POST(request: NextRequest) {
  // Read the RAW bytes FIRST. Never call request.json() before verifying —
  // you cannot re-serialize a parsed object byte for byte, and Checkout.com
  // signs the exact bytes it sent.
  const rawBody = await request.text();

  // HTTP header names are case-insensitive; Headers.get() handles the casing.
  const signatureHeader = request.headers.get('cko-signature');
  const authorizationHeader = request.headers.get('authorization');

  const signatureKey = process.env.CHECKOUT_WEBHOOK_SIGNATURE_KEY;
  const authorizationKey = process.env.CHECKOUT_WEBHOOK_AUTHORIZATION_KEY;

  // FAIL CLOSED on misconfiguration. 500 (not 401) so an operator can tell
  // "my server is misconfigured" apart from "someone sent a bad signature".
  if (!signatureKey) {
    console.error(
      'CHECKOUT_WEBHOOK_SIGNATURE_KEY is not set — refusing to accept unverified webhooks'
    );
    return NextResponse.json({ error: 'Webhook signature key not configured' }, { status: 500 });
  }

  if (!signatureHeader) {
    // Checkout.com sends no unsigned requests once a signature key is
    // configured. There is NO handshake, NO challenge and NO special test
    // envelope — an unsigned request is not one you should trust.
    console.error('Missing Cko-Signature header');
    return NextResponse.json({ error: 'Missing Cko-Signature header' }, { status: 401 });
  }

  // Check the optional static key first — it is the cheaper test.
  if (!verifyAuthorizationKey(authorizationHeader, authorizationKey)) {
    console.error('Checkout.com webhook Authorization key mismatch');
    return NextResponse.json({ error: 'Invalid Authorization key' }, { status: 401 });
  }

  if (!verifyCkoSignature(rawBody, signatureHeader, signatureKey)) {
    console.error('Checkout.com webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Verified — only now is it safe to parse.
  let event: CheckoutEvent;
  try {
    event = JSON.parse(rawBody) as CheckoutEvent;
  } catch {
    console.error('Verified request had an unparseable body');
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
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

  try {
    await handleEvent(event);
  } catch (err) {
    // Log and still return 200: a non-2xx triggers Checkout.com's 8-attempt
    // retry chain over ~30 hours, which is rarely what you want for a bug in
    // your own handler. Return 500 only when a retry could plausibly succeed.
    console.error(`Error handling Checkout.com event ${eventId}:`, err);
  }

  // Checkout.com's budget is 10 seconds. For slow work, enqueue here and return
  // immediately rather than awaiting it.
  return NextResponse.json({ received: true }, { status: 200 });
}

async function handleEvent(event: CheckoutEvent) {
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
      console.log(`💸 Payment refunded: ${data.id} ${formatAmount(data.amount, data.currency)}`);
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
      console.log(`🚨 Fraud reported on payment ${data.payment?.id}`);
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
