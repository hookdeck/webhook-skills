import crypto from 'crypto';

/**
 * Verify a Segment webhook signature.
 *
 * Segment sends X-Signature = hex(HMAC-SHA1(sharedSecret, body)). When batching
 * is enabled the body is a JSON array, but Segment signs only the FIRST event
 * (JSON.stringify(batch[0])), so a raw-body check alone fails for batches.
 */
export function verifySegmentSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signature || !secret) {
    return false;
  }

  const matches = (content: string): boolean => {
    const expected = crypto
      .createHmac('sha1', secret)
      .update(content, 'utf8')
      .digest('hex');
    // Timing-safe comparison; throws on length mismatch
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  };

  // Single event: the signature covers the raw body
  if (matches(rawBody)) {
    return true;
  }

  // Batched delivery: Segment signs only the first event in the array.
  // Note that only that first event is authenticated by the signature.
  try {
    const parsed: unknown = JSON.parse(rawBody);
    return Array.isArray(parsed) && parsed.length > 0 && matches(JSON.stringify(parsed[0]));
  } catch {
    return false;
  }
}
