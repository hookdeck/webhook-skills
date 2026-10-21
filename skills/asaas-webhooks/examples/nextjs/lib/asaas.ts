import crypto from 'crypto';

// Asaas does not sign payloads. It sends the authToken you configured, unchanged,
// in the asaas-access-token header. Compare it in constant time.
export function verifyAsaasToken(
  receivedToken: string | null | undefined,
  expectedToken: string | undefined
): boolean {
  if (!receivedToken || !expectedToken) return false;
  // Hash both sides so timingSafeEqual always gets equal-length buffers.
  const a = crypto.createHash('sha256').update(receivedToken).digest();
  const b = crypto.createHash('sha256').update(expectedToken).digest();
  return crypto.timingSafeEqual(a, b);
}

// Event IDs already handled. Use a database or Redis in production.
export const processedEvents = new Set<string>();
