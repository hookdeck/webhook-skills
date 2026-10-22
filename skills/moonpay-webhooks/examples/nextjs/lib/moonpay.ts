// Generated with: moonpay-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set MOONPAY_TIMESTAMP_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.MOONPAY_TIMESTAMP_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`MOONPAY_TIMESTAMP_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

/**
 * Verify a MoonPay webhook signature (POST webhooks only).
 *
 * Header: `Moonpay-Signature-V2: t=<unix seconds>,s=<lowercase hex>`
 * s = hex HMAC-SHA256 over `<t>.<raw body>`, keyed with the webhook API key as a string.
 * GET callbacks sign the query string instead and are NOT covered here.
 */
export function verifyMoonpayWebhook(
  rawBody: string,
  header: string | null,
  apiKey: string,
  toleranceSeconds = timestampToleranceSeconds(),
  nowSeconds = Date.now() / 1000
): boolean {
  if (!header || !apiKey) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const signature = parts.find(([k]) => k === 's')?.[1];
  if (!t || !/^\d+$/.test(t) || !signature) return false;

  // Opt-in replay window: retries and replays carry the original `t`.
  if (toleranceSeconds > 0 && Math.abs(nowSeconds - Number(t)) > toleranceSeconds) return false;

  const expected = crypto
    .createHmac('sha256', apiKey)
    .update(`${t}.${rawBody}`)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // length mismatch = invalid
  }
}
