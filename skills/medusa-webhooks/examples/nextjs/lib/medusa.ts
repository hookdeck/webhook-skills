// Generated with: medusa-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Optional replay window in seconds. Off by default (0): Medusa re-signs its own retries, but
// Hookdeck retries and replays resend the original timestamp, so a window would reject late
// redeliveries. Set MEDUSA_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any
// other value is treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.MEDUSA_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`MEDUSA_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

/**
 * Verify a Medusa Cloud webhook signature.
 *
 * Header: `X-Medusa-Signature: t=<unix seconds>,v1=<hex>`
 * v1 = hex HMAC-SHA256 over `<t>.<raw body>`, keyed with the endpoint signing secret as UTF-8.
 * The docs suggest rejecting timestamps older than 5 minutes; that check is opt-in here.
 */
export function verifyMedusaWebhook(
  rawBody: string,
  header: string | null,
  secret: string,
  toleranceSeconds = timestampToleranceSeconds(),
  nowSeconds = Date.now() / 1000
): boolean {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !/^\d+$/.test(t) || signatures.length === 0) return false;

  // Medusa's docs suggest a 5-minute window, but Hookdeck retries and replays carry the
  // original `t`, so the window is opt-in (toleranceSeconds > 0).
  if (toleranceSeconds > 0 && Math.abs(nowSeconds - Number(t)) > toleranceSeconds) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${t}.${rawBody}`)
    .digest('hex');

  return signatures.some((sig) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false; // length mismatch = invalid
    }
  });
}
