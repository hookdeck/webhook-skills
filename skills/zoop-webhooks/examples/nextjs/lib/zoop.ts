// Generated with: zoop-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export type ZoopAuthConfig = Record<string, string | undefined>;

export interface ZoopEvent {
  id?: string;
  resource?: string;
  type: string;
  source?: string | null;
  payload?: { object?: Record<string, unknown> };
  uri?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the value's length isn't leaked.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Zoop does not sign payloads. It sends back, verbatim in the Authorization header, the
 * "authorization" string you set when creating the webhook. Compare the whole header value;
 * don't strip or parse any prefix. A static credential authenticates the sender only: it
 * gives no replay protection, so use HTTPS and rotate the value if it leaks.
 */
export function verifyZoopRequest(
  headers: Headers,
  config: ZoopAuthConfig = process.env
): boolean {
  const expected = config.ZOOP_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers.get('authorization');
  if (!received) return false;
  return safeEqual(received, expected);
}

// Event ids already processed. Use a durable store (Redis, a database unique key) in production.
const seen = new Set<string>();

export function resetSeen(): void {
  seen.clear();
}

/** Dispatch on event.type. Returns what happened, which is handy for tests. */
export function processEvent(event: ZoopEvent): string {
  if (event.id) {
    if (seen.has(event.id)) return 'duplicate';
    seen.add(event.id);
  }

  const id = event.payload?.object?.id;

  switch (event.type) {
    case 'ping':
      // Sent once when the webhook is created; a 200 activates the webhook.
      console.log('Zoop ping received');
      break;

    case 'transaction.succeeded':
      console.log(`Transaction ${id} succeeded`);
      // TODO: mark the order as paid and fulfil it
      break;

    case 'transaction.failed':
      console.log(`Transaction ${id} failed`);
      // TODO: notify the buyer or retry the payment
      break;

    case 'transaction.canceled':
      console.log(`Transaction ${id} canceled`);
      // TODO: release stock
      break;

    case 'seller.activated':
      console.log(`Seller ${id} activated`);
      // TODO: enable payouts for the seller
      break;

    case 'bank_account.associated':
      console.log(`Bank account ${id} associated`);
      // TODO: mark the seller's payout details as ready
      break;

    default:
      console.log(`Unhandled Zoop event type: ${event.type}`);
  }
  return event.type;
}
