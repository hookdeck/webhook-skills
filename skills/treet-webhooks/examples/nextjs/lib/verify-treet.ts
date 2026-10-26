// Generated with: treet-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Treet's docs don't name the HTTP method, so accept all the usual ones.
export const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

// Standard padded base64 of a 32-byte digest: 43 characters plus one "=".
const SIGNATURE_RE = /^[A-Za-z0-9+/]{43}=$/;

/**
 * X-Treet-Signature is base64(HMAC-SHA256(secret, raw body)), the whole header value.
 * The key is the secret's UTF-8 bytes; the message is the raw body bytes (no timestamp).
 */
export function verifyTreetSignature(
  rawBody: Buffer,
  signature: string | null | undefined,
  secret: string | undefined = process.env.TREET_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  if (typeof signature !== 'string' || !SIGNATURE_RE.test(signature)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  // Both are 44 ASCII characters, so the buffers have equal length.
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export function handleEvent(payload: Record<string, unknown>): void {
  // `trigger` is the specific event; `topic` is the coarser topic ("label").
  switch (payload.trigger) {
    case 'label/created':
      console.log(`Shipping label created for bundle ${String(payload.bundleId)}`);
      // TODO: store the carrier and tracking number
      break;

    case 'label/updated':
      console.log(`Shipping label updated for bundle ${String(payload.bundleId)}: ${String(payload.status)}`);
      // TODO: update the shipment status
      break;

    default:
      console.log(`Unhandled Treet trigger: ${String(payload.trigger)}`);
  }
}
