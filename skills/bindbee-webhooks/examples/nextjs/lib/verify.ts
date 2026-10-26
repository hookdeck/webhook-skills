import crypto from 'crypto';

export interface BindbeeHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

/**
 * Verify a Bindbee (Standard Webhooks) delivery by hand.
 *
 * Bindbee's secret is NOT a base64 "whsec_" secret: its raw UTF-8 bytes are the
 * HMAC key, so do not use the standardwebhooks or svix libraries here.
 * signature = base64(HMAC-SHA256(key, "{webhook-id}.{webhook-timestamp}." + rawBody))
 */
export function verifyBindbeeSignature(
  rawBody: Buffer,
  headers: BindbeeHeaders,
  secret: string | undefined,
  toleranceSeconds = 0
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !secret) return false;
  if (!/^[1-9][0-9]*$/.test(timestamp)) return false;

  if (toleranceSeconds > 0) {
    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (age > toleranceSeconds) return false;
  }

  const key = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice('whsec_'.length), 'base64')
    : Buffer.from(secret, 'utf8');
  if (key.length === 0) return false; // fail closed

  const signedContent = Buffer.concat([Buffer.from(`${id}.${timestamp}.`, 'utf8'), rawBody]);
  const expected = Buffer.from(
    crypto.createHmac('sha256', key).update(signedContent).digest('base64')
  );

  // The header holds one or more space-separated "v1,<base64>" entries; ignore other versions
  return signature.split(' ').some((entry) => {
    const comma = entry.indexOf(',');
    if (comma === -1 || entry.slice(0, comma) !== 'v1') return false;
    const candidate = Buffer.from(entry.slice(comma + 1));
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  });
}
