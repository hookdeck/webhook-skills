import { createHash, timingSafeEqual } from 'crypto';

/**
 * Helius does not sign webhooks. The authHeader configured on the webhook is
 * sent verbatim as the Authorization header, so compare the whole value.
 * Hashing both sides gives timingSafeEqual equal-length buffers.
 */
export function verifyHeliusAuth(
  received: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (!received || !expected) return false;
  const a = createHash('sha256').update(received).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

// In-memory de-duplication by Solana transaction signature.
// Use a durable store (Redis, database) in production.
export const seenSignatures = new Set<string>();
