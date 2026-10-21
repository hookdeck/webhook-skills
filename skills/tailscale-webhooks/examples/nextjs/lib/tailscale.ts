// Generated with: tailscale-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Verify a Tailscale webhook signature.
 *
 * Header: `Tailscale-Webhook-Signature: t=<unix seconds>,v1=<hex>`
 * v1 = hex HMAC-SHA256 over `<t>.<raw body>`, keyed with the webhook secret as a raw string.
 * Tailscale suggests rejecting timestamps older than 5 minutes.
 */
export function verifyTailscaleWebhook(
  rawBody: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
  nowSeconds = Date.now() / 1000
): boolean {
  if (!header || !secret) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !/^\d+$/.test(t) || signatures.length === 0) return false;

  // Replay protection
  if (Math.abs(nowSeconds - Number(t)) > toleranceSeconds) return false;

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
