// Generated with: micetribe-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

// X-Timestamp window, off by default (0). A gateway such as Hookdeck re-sends retries and
// replays with the original X-Timestamp, so a default window would reject them. Set
// MICETRIBE_WEBHOOK_TOLERANCE_SECONDS to a positive value to opt in.
export const DEFAULT_TOLERANCE_SECONDS = 0;

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

/**
 * Verify a MICEtribe webhook.
 *
 * X-Signature = hex HMAC-SHA256( secret, X-Timestamp + "." + raw_request_body ), keyed with the
 * webhook's signing secret as UTF-8 bytes. The signed message is built as bytes: the X-Timestamp
 * header string (latin1), a literal ".", then the exact body bytes.
 */
export function verifyMicetribeSignature(
  rawBody: Buffer,
  signature: string | null | undefined,
  timestamp: string | null | undefined,
  secret: string | undefined,
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
  now: number = Math.floor(Date.now() / 1000)
): { valid: boolean; error?: string } {
  if (!signature) return { valid: false, error: 'Missing X-Signature header' };
  if (!timestamp) return { valid: false, error: 'Missing X-Timestamp header' };
  if (!secret) return { valid: false, error: 'Missing webhook secret' };
  // Validate the format before decoding: Buffer.from(x, 'hex') silently drops bad characters.
  if (!HEX_SHA256.test(signature)) return { valid: false, error: 'Malformed X-Signature header' };

  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) return { valid: false, error: 'Invalid X-Timestamp header' };
    if (Math.abs(now - Number(timestamp)) > toleranceSeconds) {
      return { valid: false, error: 'Timestamp outside tolerance window' };
    }
  }

  const signed = Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from('.', 'utf8'), rawBody]);
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(signed).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // validated above
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    return { valid: false, error: 'Invalid signature' };
  }
  return { valid: true };
}

// A value that isn't a whole number of seconds is treated as 0 (check off), with a warning.
let warnedInvalidTolerance = false;
export function toleranceFromEnv(env: Record<string, string | undefined> = process.env): number {
  const raw = (env.MICETRIBE_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return DEFAULT_TOLERANCE_SECONDS;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`MICETRIBE_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
