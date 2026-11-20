// Generated with: roblox-webhooks skill
// https://github.com/hookdeck/webhook-skills
//
// Roblox webhook notifications carry a `roblox-signature` header:
//
//   roblox-signature: t=<unix seconds>,v1=<signature>
//
// v1 = base64( HMAC-SHA256( key = webhook secret, message = "<t>.<raw body>" ) )
//
// The timestamp is part of the signed message, so it can't be altered without
// breaking the HMAC. If the webhook has no secret in the Creator Dashboard,
// Roblox sends only `t=<timestamp>`: there is nothing to authenticate, so we reject.
import crypto from 'crypto';

// Roblox's runnable sample uses a 300 s window; its prose suggests up to 10 minutes.
export const DEFAULT_TOLERANCE_SECONDS = 300;

export type VerifyResult =
  | { valid: true; timestamp: number }
  | { valid: false; reason: string };

export function toleranceSeconds(): number {
  const value = Number(process.env.ROBLOX_WEBHOOK_TOLERANCE_SECONDS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TOLERANCE_SECONDS;
}

/**
 * Parse `t=...,v1=...`. Don't assume member order or count. Split on the FIRST
 * `=` only, because base64 signatures end in `=` padding.
 */
export function parseRobloxSignatureHeader(header: string | null | undefined) {
  const parsed: { timestamp: string | null; signatures: string[] } = { timestamp: null, signatures: [] };
  for (const member of String(header ?? '').split(',')) {
    const index = member.indexOf('=');
    if (index === -1) continue;
    const key = member.slice(0, index).trim();
    const value = member.slice(index + 1).trim();
    if (key === 't') parsed.timestamp = value;
    else if (key === 'v1' && value) parsed.signatures.push(value);
  }
  return parsed;
}

/** Verify against the exact bytes Roblox sent (not re-serialised JSON). `now` is in ms. */
export function verifyRobloxSignature(
  rawBody: Buffer | string,
  header: string | null | undefined,
  secret: string | undefined,
  options: { tolerance?: number; now?: number } = {}
): VerifyResult {
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE_SECONDS;
  const now = options.now ?? Date.now();

  if (!secret) return { valid: false, reason: 'secret_not_configured' };
  if (!header) return { valid: false, reason: 'missing_header' };

  const { timestamp, signatures } = parseRobloxSignatureHeader(header);
  if (!timestamp || !/^\d+$/.test(timestamp)) return { valid: false, reason: 'missing_timestamp' };
  // No v1 = webhook saved without a secret. Never "skip verification" here:
  // that's exactly what a forged request would look like.
  if (signatures.length === 0) return { valid: false, reason: 'missing_v1' };

  // t is Unix time in SECONDS.
  if (Math.abs(Math.floor(now / 1000) - Number(timestamp)) > tolerance) {
    return { valid: false, reason: 'timestamp_outside_tolerance' };
  }

  const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
  const expected = Buffer.from(
    crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest('base64')
  );
  const matched = signatures.some((signature) => {
    const candidate = Buffer.from(signature);
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  });
  return matched ? { valid: true, timestamp: Number(timestamp) } : { valid: false, reason: 'signature_mismatch' };
}

/** EventTime has 7 fractional digits ("2023-12-30T16:24:24.2118874Z"): trim to ms for Date. */
export function parseEventTime(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value.replace(/(\.\d{3})\d+/, '$1'));
  return Number.isNaN(date.getTime()) ? null : date;
}
