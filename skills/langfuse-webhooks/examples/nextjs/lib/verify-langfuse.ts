// Generated with: langfuse-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

/**
 * Verify the x-langfuse-signature header: `t=<timestamp>,v1=<hex>`.
 * v1 = hex HMAC-SHA256(key = secret as UTF-8, message = `<t>.<raw body bytes>`).
 * `t` is used exactly as it appears in the header (never parsed and re-formatted).
 * Any v1= entry may match (key rotation); other keys such as v0 are ignored.
 */
export function verifyLangfuseSignature(
  rawBody: Buffer,
  signatureHeader: string | null | undefined,
  secret: string | undefined = process.env.LANGFUSE_WEBHOOK_SECRET,
  toleranceSeconds: number = Number(process.env.LANGFUSE_WEBHOOK_TOLERANCE_SECONDS) || 0,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
  if (!secret || !signatureHeader) return false;

  let timestamp: string | undefined;
  const candidates: string[] = [];
  for (const part of signatureHeader.split(',')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === 't' && timestamp === undefined) timestamp = value;
    else if (key === 'v1') candidates.push(value);
  }
  if (!timestamp || candidates.length === 0) return false;

  // Opt-in replay window (t is Unix seconds). Off by default.
  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) return false;
  }

  // Signed message is built as bytes: `${t}.` + the raw body exactly as received.
  const expected = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), rawBody]))
    .digest();

  let ok = false;
  for (const candidate of candidates) {
    // Validate length and alphabet before decoding: Buffer.from(x, 'hex') silently drops bad characters.
    if (!HEX_SHA256.test(candidate)) continue;
    const received = Buffer.from(candidate.toLowerCase(), 'hex');
    if (received.length === expected.length && crypto.timingSafeEqual(received, expected)) ok = true;
  }
  return ok;
}
