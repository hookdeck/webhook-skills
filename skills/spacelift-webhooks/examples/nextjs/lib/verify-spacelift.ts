// Generated with: spacelift-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Verify X-Signature-256: `sha256=<hex>` HMAC-SHA256 over the raw body bytes only.
 * The prefix is optional. The key is the secret's UTF-8 bytes, used as-is.
 */
export function verifySpaceliftSignature(
  rawBody: Buffer,
  header: string | null | undefined,
  secret: string | undefined = process.env.SPACELIFT_WEBHOOK_SECRET
): boolean {
  if (!secret || typeof header !== 'string') return false;
  const sig = header.trim().replace(/^sha256=/i, '');
  // Validate before decoding: Buffer.from(x, 'hex') silently drops bad characters.
  if (!/^[0-9a-fA-F]{64}$/.test(sig)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(sig.toLowerCase(), 'hex');
  return crypto.timingSafeEqual(expected, received); // both 32 bytes
}

// Spacelift has no event-name field: tell the two documented payload shapes apart.
export function classify(payload: unknown): 'run' | 'internal_error' | 'unknown' {
  if (!payload || typeof payload !== 'object') return 'unknown';
  const p = payload as Record<string, unknown>;
  if ('state' in p && 'stateVersion' in p && 'run' in p) return 'run';
  if ('title' in p && 'body' in p) return 'internal_error';
  return 'unknown';
}
