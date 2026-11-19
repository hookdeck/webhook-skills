// Generated with: flutterwave-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Flutterwave has two webhook schemes, both still supported:
//   v4  flutterwave-signature = base64(HMAC-SHA256(key = secret hash, raw body))
//   v3  verif-hash            = the secret hash itself (no signature)
// If flutterwave-signature is present, verify v4 and don't fall back to v3.
// Flutterwave's v4 docs contradict themselves: the "Sample hashing" helper signs
// the raw body, but later examples compare the header to the secret hash. This
// follows the HMAC helper.

export type FlutterwaveVersion = 'v4' | 'v3';

/** Constant-time comparison of two strings via equal-length SHA-256 digests. */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function verifyFlutterwaveWebhook(
  rawBody: Buffer | string,
  headers: Headers,
  secretHash: string | undefined
): FlutterwaveVersion | null {
  if (!secretHash) return null;

  const signature = headers.get('flutterwave-signature');
  if (signature) {
    const expected = crypto.createHmac('sha256', secretHash).update(rawBody).digest();
    const given = Buffer.from(signature, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected) ? 'v4' : null;
  }

  const verifHash = headers.get('verif-hash');
  if (verifHash && safeEqual(verifHash, secretHash)) return 'v3';
  return null;
}

export interface FlutterwaveEvent {
  type?: string; // v4
  event?: string; // v3
  webhook_id?: string; // v4 (the webhooks page sample calls it `id`)
  id?: string | number;
  timestamp?: number;
  data?: Record<string, any>;
  [key: string]: unknown;
}

/**
 * Key for skipping duplicates: the v4 webhook ID; for v3, event + data.id +
 * data.status as Flutterwave suggests; otherwise a hash of the body.
 */
export function dedupeKey(event: FlutterwaveEvent, rawBody: Buffer | string): string {
  if (event.type && (event.webhook_id || event.id)) return `v4:${event.webhook_id || event.id}`;
  if (event.event && event.data) return `v3:${event.event}:${event.data.id}:${event.data.status}`;
  return `body:${crypto.createHash('sha256').update(rawBody).digest('hex')}`;
}
