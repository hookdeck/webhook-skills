import crypto from 'crypto';

// Convex log stream: x-webhook-signature = "sha256=" + hex(HMAC-SHA256(secret, rawBody)).
// Only the raw body is signed (no timestamp), and the bare digest is accepted too.
export function verifySignature(
  rawBody: Buffer,
  signatureHeader: string | null,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) return false;
  const received = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice('sha256='.length)
    : signatureHeader;
  // Check the hex shape first: Buffer.from(x, 'hex') silently drops invalid characters
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(received.toLowerCase()), Buffer.from(expected));
}

// The body is a JSON array of log events (or one JSON object per line for JSONL streams)
export function parseEvents(rawBody: Buffer): Record<string, any>[] {
  const text = rawBody.toString('utf8');
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return text.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line));
  }
}
