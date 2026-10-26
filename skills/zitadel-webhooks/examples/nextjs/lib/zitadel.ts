import crypto from 'crypto';

// ZITADEL Actions v2 targets with the JSON payload type sign every request in the
// ZITADEL-Signature header: "t=<unix seconds>,v1=<hex>" (one v1 per signing key).
// v1 is the lowercase hex HMAC-SHA256 of "<t>.<raw body>", keyed with the target's signingKey (UTF-8 bytes).
// https://zitadel.com/docs/guides/integrate/actions/testing-request-signature
// JWT and JWE payload types are not signed this way and are not covered here.

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set ZITADEL_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
export function timestampToleranceSeconds(): number {
  const raw = (process.env.ZITADEL_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`ZITADEL_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}

// "t=1700000000,v1=<hex>,v1=<hex>,v0=<ignored>" -> { timestamp: '1700000000', signatures: ['<hex>', '<hex>'] }
// The timestamp stays a string: it is part of the signed message exactly as sent.
export function parseSignatureHeader(header: string): { timestamp?: string; signatures: string[] } {
  const parsed: { timestamp?: string; signatures: string[] } = { signatures: [] };
  for (const item of header.split(',')) {
    const i = item.indexOf('=');
    if (i <= 0) continue;
    const key = item.slice(0, i).trim();
    const value = item.slice(i + 1).trim();
    if (key === 't' && parsed.timestamp === undefined) parsed.timestamp = value;
    else if (key === 'v1') parsed.signatures.push(value);
  }
  return parsed;
}

export function verifyZitadel(rawBody: Buffer, signatureHeader: string | null, secret: string): boolean {
  if (!secret || !signatureHeader) return false;

  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);
  if (!timestamp || signatures.length === 0) return false;

  // Opt-in only: off unless ZITADEL_WEBHOOK_TOLERANCE_SECONDS > 0.
  const tolerance = timestampToleranceSeconds();
  if (tolerance > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > tolerance) return false;
  }

  // Signed message as bytes: "<t>." followed by the raw body bytes, untouched.
  const expected = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), rawBody]))
    .digest();

  // A header can carry several v1 entries (key rotation); any one matching is enough.
  return signatures.some((sig) => {
    // Validate before decoding: Buffer.from(x, 'hex') silently drops bad characters.
    if (!/^[0-9a-fA-F]{64}$/.test(sig)) return false;
    const received = Buffer.from(sig.toLowerCase(), 'hex');
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}
