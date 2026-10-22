import crypto from 'crypto';

/**
 * Look up the app secret for a shop. Each shop has its own secret, assigned
 * during the registration handshake. Replace with a database lookup in production.
 */
export function getShopSecret(shopId: string): string | null {
  try {
    const secrets = JSON.parse(process.env.SHOPWARE_APP_SECRETS || '{}');
    if (secrets[shopId]) return secrets[shopId];
  } catch {
    // fall through to the single-secret fallback
  }
  return process.env.SHOPWARE_APP_SECRET || null;
}

/**
 * Verify Shopware webhook signature (hex HMAC-SHA256 of the raw body)
 */
export function verifyShopwareWebhook(
  rawBody: string,
  signature: string | null,
  secret: string | null
): boolean {
  if (!signature || !secret) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}
