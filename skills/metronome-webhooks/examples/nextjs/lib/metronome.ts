// Generated with: metronome-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

// Metronome may deliver an event more than once: dedupe on the body's `id`.
// In-memory for the example; use a shared store (Redis, a DB unique key) in production.
export const seenEventIds = new Set<string>();

/**
 * The exact bytes Metronome signs: `{X-Metronome-Date}` + LF (0x0A) + raw body.
 * Built as bytes: the header as latin1 (as received, never trimmed or reformatted),
 * the body untouched. Never decode and re-encode the body.
 */
export function buildSignedBytes(rawBody: Buffer, dateHeader: string): Buffer {
  return Buffer.concat([
    Buffer.from(dateHeader, 'latin1'),
    Buffer.from('\n', 'utf8'),
    rawBody,
  ]);
}

export function computeMetronomeSignature(rawBody: Buffer, dateHeader: string, secret: string): string {
  return crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8')) // secret is used as-is, not decoded
    .update(buildSignedBytes(rawBody, dateHeader))
    .digest('hex');
}

/** Verify Metronome-Webhook-Signature: bare hex HMAC-SHA256, no prefix. */
export function verifyMetronomeSignature(
  rawBody: Buffer,
  signatureHeader: string | null | undefined,
  dateHeader: string | null | undefined,
  secret: string | null | undefined
): boolean {
  if (!signatureHeader || !dateHeader || !secret) return false;

  // Validate the format before decoding: exactly 64 hex chars (case-insensitive)
  if (!/^[0-9a-fA-F]{64}$/.test(signatureHeader)) return false;

  const expected = Buffer.from(computeMetronomeSignature(rawBody, dateHeader, secret), 'hex');
  const provided = Buffer.from(signatureHeader.toLowerCase(), 'hex');
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

// Retries and Hookdeck replays resend the original X-Metronome-Date, and Hookdeck applies
// no tolerance itself, so the window is OFF unless METRONOME_WEBHOOK_TOLERANCE_SECONDS is set.
export function getToleranceSeconds(): number {
  const n = Number(process.env.METRONOME_WEBHOOK_TOLERANCE_SECONDS);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// X-Metronome-Date is an HTTP date, e.g. 'Mon, 02 Jan 2006 22:04:05 GMT'
export function isDateWithinTolerance(
  dateHeader: string,
  tolerance: number = getToleranceSeconds(),
  now: number = Date.now()
): boolean {
  if (!tolerance) return true;
  const sent = Date.parse(dateHeader);
  if (Number.isNaN(sent)) return false;
  return Math.abs(now - sent) / 1000 <= tolerance;
}
