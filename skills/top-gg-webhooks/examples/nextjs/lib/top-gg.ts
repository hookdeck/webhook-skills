// Generated with: top-gg-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set TOP_GG_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.TOP_GG_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`TOP_GG_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

const HEX_SHA256 = /^[0-9a-f]{64}$/i;

/**
 * Verify a Top.gg v1 webhook signature.
 *
 * Header: `x-topgg-signature: t=<unix seconds>,v1=<hex>[,v1=<hex>]`. Other keys (e.g. v0) are ignored.
 * v1 = hex HMAC-SHA256 over `<t>.<raw body bytes>`, keyed with the `whs_` secret used WHOLE as
 * UTF-8 bytes (not hex- or base64-decoded). `t` is used exactly as it appears in the header.
 */
export function verifyTopGgWebhook(
  rawBody: Uint8Array,
  header: string | null,
  secret: string,
  toleranceSeconds = timestampToleranceSeconds(),
  nowSeconds = Date.now() / 1000
): boolean {
  if (!header || !secret) return false;
  const pairs = header.split(',').map((part): [string, string] => {
    const p = part.trim();
    const i = p.indexOf('=');
    return i < 0 ? [p, ''] : [p.slice(0, i), p.slice(i + 1)];
  });
  const t = pairs.find(([k]) => k === 't')?.[1];
  if (!t) return false;
  // Validate the format (exactly 64 hex chars) before comparing; hex is case-insensitive.
  const signatures = pairs
    .filter(([k, v]) => k === 'v1' && HEX_SHA256.test(v))
    .map(([, v]) => Buffer.from(v.toLowerCase()));
  if (signatures.length === 0) return false;

  // Hookdeck retries and replays keep the original `t`, so the window is opt-in.
  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(t)) return false;
    if (Math.abs(nowSeconds - Number(t)) > toleranceSeconds) return false;
  }

  const expected = Buffer.from(
    crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest('hex')
  );
  // Every candidate is 64 bytes, same as `expected`, so timingSafeEqual cannot throw.
  return signatures.some((sig) => crypto.timingSafeEqual(sig, expected));
}
