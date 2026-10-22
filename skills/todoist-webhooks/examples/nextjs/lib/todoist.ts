import crypto from 'crypto';

/**
 * Verify Todoist webhook signature: base64(HMAC-SHA256(client_secret, raw body)).
 */
export function verifyTodoistWebhook(
  rawBody: string,
  signatureHeader: string | null,
  clientSecret: string | undefined
): boolean {
  if (!signatureHeader || !clientSecret) return false;
  const expected = crypto
    .createHmac('sha256', clientSecret)
    .update(rawBody, 'utf8')
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false; // length mismatch
  }
}

// Delivery IDs already processed. Use a shared store (Redis, DB) in production.
export const seenDeliveries = new Set<string>();
