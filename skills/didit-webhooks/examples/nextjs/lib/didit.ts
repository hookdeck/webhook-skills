// Generated with: didit-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

// X-Timestamp window, off by default (0). Didit recommends 300 seconds, but a gateway such as
// Hookdeck re-sends retries and replays with the original X-Timestamp, so a default window
// would reject them. Set DIDIT_TIMESTAMP_TOLERANCE_SECONDS to a positive value to opt in.
export const DEFAULT_TOLERANCE_SECONDS = 0;

export interface VerifyResult {
  valid: boolean;
  error?: string;
}

/**
 * Verify a Didit webhook.
 *
 * X-Signature = hex HMAC-SHA256 of the exact raw request body, keyed with the
 * destination's secret_shared_key (raw string). X-Timestamp (unix seconds) is a
 * separate header and is NOT part of the signed input; Didit's docs say to
 * reject anything older than 300 seconds. That check is opt-in here: toleranceSeconds = 0
 * (the default) disables it.
 */
export function verifyDiditSignature(
  rawBody: string | Buffer,
  signature: string | null | undefined,
  timestamp: string | null | undefined,
  secret: string | undefined,
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
  now: number = Math.floor(Date.now() / 1000)
): VerifyResult {
  if (!signature) return { valid: false, error: 'Missing X-Signature header' };
  if (!secret) return { valid: false, error: 'Missing webhook secret' };

  if (toleranceSeconds > 0) {
    const ts = Number.parseInt(timestamp ?? '', 10);
    if (!timestamp || Number.isNaN(ts)) {
      return { valid: false, error: 'Missing or invalid X-Timestamp header' };
    }
    if (Math.abs(now - ts) > toleranceSeconds) {
      return { valid: false, error: 'Timestamp outside tolerance window' };
    }
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // Length guard first: timingSafeEqual throws on mismatched lengths.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, error: 'Invalid signature' };
  }
  return { valid: true };
}

// A value that isn't a whole number of seconds is treated as 0 (check off), with a warning.
let warnedInvalidTolerance = false;
export function toleranceFromEnv(env: Record<string, string | undefined> = process.env): number {
  const raw = (env.DIDIT_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return DEFAULT_TOLERANCE_SECONDS;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`DIDIT_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
toleranceFromEnv(); // surface an invalid value at startup
