// Generated with: didit-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

export const DEFAULT_TOLERANCE_SECONDS = 300;

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
 * reject anything older than 300 seconds. toleranceSeconds = 0 disables that check.
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

export function toleranceFromEnv(env: Record<string, string | undefined> = process.env): number {
  const raw = env.DIDIT_TIMESTAMP_TOLERANCE_SECONDS;
  const parsed = raw === undefined || raw === '' ? NaN : Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? DEFAULT_TOLERANCE_SECONDS : parsed;
}
