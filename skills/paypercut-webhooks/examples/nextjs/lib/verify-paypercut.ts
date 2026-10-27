// Generated with: paypercut-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'node:crypto';

// Paypercut's docs don't name the HTTP method, so accept all the usual ones.
export const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export interface PaypercutEvent {
  type: string;
  data?: { id?: string } & Record<string, unknown>;
  account?: string;
}

/**
 * Parse `Paypercut-Signature: t=<unix seconds>,v1=<hex>[,v1=<hex>...]`.
 * Returns the t value exactly as sent (a string) and every v1 entry; other keys (v0...) are ignored.
 */
function parseSignatureHeader(header: string | null | undefined): { t: string; v1: string[] } | null {
  if (typeof header !== 'string') return null;
  let t: string | null = null;
  const v1: string[] = [];
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
export function toleranceFromEnv(): number {
  const n = Number(process.env.PAYPERCUT_WEBHOOK_TOLERANCE_SECONDS);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Verify a Paypercut delivery. HMAC-SHA256 (hex) over `${t}.${rawBody}`, keyed with the
 * endpoint secret's UTF-8 bytes. `t` is used exactly as it appears in the header, and the
 * body stays raw bytes (never decoded or re-serialised).
 */
export function verifyPaypercutSignature(
  rawBody: Uint8Array,
  header: string | null | undefined,
  secret: string | undefined = process.env.PAYPERCUT_WEBHOOK_SECRET,
  toleranceSeconds: number = toleranceFromEnv()
): boolean {
  if (!secret) return false;
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

export function handleEvent(event: PaypercutEvent): void {
  // Envelope: { type, data, account? } (`account` identifies a connected account)
  const { type, data, account } = event;
  const id = data?.id;
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
