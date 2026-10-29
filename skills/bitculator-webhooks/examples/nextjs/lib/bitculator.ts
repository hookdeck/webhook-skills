// Generated with: bitculator-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

// Bitculator signs every delivery:
//   X-Bitculator-Signature: t=<unix seconds>,v1=<hex>
// v1 = HMAC-SHA256 of "<t>.<raw body>" in hex, keyed with the whole secret string's UTF-8 bytes
// (the whsec_ prefix included; not base64-decoded). <t> is used exactly as it appears in the header.
// https://bitculator.com/en/documentation/api/v1

// Optional replay window in seconds, off by default (unset or 0). Bitculator's own example accepts a
// delivery only when |now - t| < 300; set BITCULATOR_WEBHOOK_TOLERANCE_SECONDS=300 to match that when
// Bitculator calls you directly. Behind Hookdeck leave it off: Hookdeck retries and replays resend
// the original timestamp, so a window rejects legitimate redeliveries.
// An invalid value leaves the check off, with a warning.
const DEFAULT_TOLERANCE_SECONDS = 0;
let warnedInvalidTolerance = false;
function toleranceSeconds(): number {
  const raw = (process.env.BITCULATOR_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return DEFAULT_TOLERANCE_SECONDS;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`BITCULATOR_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return DEFAULT_TOLERANCE_SECONDS;
  }
  return Number(raw);
}
toleranceSeconds(); // surface an invalid value at startup

// "t=1700000000,v1=abc" -> { t: '1700000000', v1: ['abc'] } (any number of v1 entries; other keys ignored)
function parseSignatureHeader(header: string): { t?: string; v1: string[] } {
  const parsed: { t?: string; v1: string[] } = { v1: [] };
  for (const kv of header.split(',')) {
    const i = kv.indexOf('=');
    if (i <= 0) continue;
    const key = kv.slice(0, i).trim();
    const value = kv.slice(i + 1).trim();
    if (key === 't') parsed.t = value;
    else if (key === 'v1') parsed.v1.push(value);
  }
  return parsed;
}

// rawBody: the exact bytes received (never decoded to a string and re-encoded)
export function verifyBitculator(rawBody: Buffer, signatureHeader: string, secret: string): boolean {
  if (!secret || !signatureHeader) return false;

  const { t, v1 } = parseSignatureHeader(signatureHeader);
  if (!t || !/^[0-9]+$/.test(t)) return false;

  const tolerance = toleranceSeconds();
  if (tolerance > 0 && !(Math.abs(Math.floor(Date.now() / 1000) - Number(t)) < tolerance)) {
    return false;
  }

  const expected = Buffer.from(
    crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest('hex')
  );
  return v1.some((sig) => {
    // Exactly 64 hex characters (case-insensitive) before comparing
    if (!/^[0-9a-fA-F]{64}$/.test(sig)) return false;
    const candidate = Buffer.from(sig.toLowerCase());
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  });
}
