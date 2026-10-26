// Generated with: lettermint-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set LETTERMINT_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.LETTERMINT_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`LETTERMINT_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

/**
 * Verify a Lettermint webhook signature.
 *
 * Header: `X-Lettermint-Signature: t=<unix seconds>,v1=<hex>`
 * v1 = hex HMAC-SHA256 over `<t>.<raw body>`, keyed with the whole webhook secret
 * (including `whsec_`) as UTF-8 bytes. Not Standard Webhooks: nothing is stripped or decoded.
 * Lettermint recommends a 5-minute window; that check is opt-in here.
 */
export function verifyLettermintWebhook(
  rawBody: Uint8Array,
  header: string | null,
  secret: string,
  toleranceSeconds = timestampToleranceSeconds(),
  nowSeconds = Date.now() / 1000
): boolean {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t) return false;

  // Retries (and Hookdeck's replays) carry the original `t`, so the window is opt-in.
  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(t) || Math.abs(nowSeconds - Number(t)) > toleranceSeconds) return false;
  }

  // Sign `t` exactly as sent (never parse and re-format it), then the raw body bytes.
  const expected = crypto
    .createHmac('sha256', secret)
    .update(Buffer.from(`${t}.`, 'latin1'))
    .update(rawBody)
    .digest();

  // Any v1 may match (several appear during key rotation). Validate length and alphabet before
  // decoding: Buffer.from(x, 'hex') silently drops bad characters.
  return signatures.some(
    (sig) => /^[0-9a-fA-F]{64}$/.test(sig) && crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected)
  );
}
