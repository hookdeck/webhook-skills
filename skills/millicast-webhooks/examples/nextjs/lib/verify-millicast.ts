// Generated with: millicast-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Millicast (Dolby OptiView Real-time Streaming) signs each webhook with:
//   x-millicast-signature: sha1=<hex HMAC-SHA1 of the raw body>
// The body is JSON for most hooks and a JPEG for thumbnail hooks; both are
// signed as raw bytes. The Webhook Secret is base64: decode it to get the key.

/**
 * The secret is issued base64-encoded: the HMAC key is its decoded bytes.
 * Node's base64 decoder skips characters it doesn't know and ignores stray
 * bits, so insist on canonical base64 instead of keying with the wrong bytes.
 * Surrounding whitespace (a pasted trailing newline) is trimmed.
 */
export function decodeBase64Secret(secret: string | undefined | null): Buffer | null {
  const value = String(secret ?? '').trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const key = Buffer.from(value, 'base64');
  if (key.length === 0) return null;
  if (key.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')) return null;
  return key;
}

/** Constant-time comparison of two byte buffers that may differ in length. */
function bytesEqual(given: Buffer, expected: Buffer): boolean {
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

export function verifyMillicastWebhook(
  rawBody: Buffer,
  signature: string | null | undefined,
  secret: string | undefined
): boolean {
  const key = decodeBase64Secret(secret);
  if (!key || !signature) return false;
  const match = /^sha1=((?:[0-9a-fA-F]{2})+)$/.exec(signature.trim());
  if (!match) return false;
  const expected = crypto.createHmac('sha1', key).update(rawBody).digest();
  return bytesEqual(Buffer.from(match[1], 'hex'), expected);
}

/** The envelope JSON hooks share (thumbnail hooks send a JPEG instead). */
export interface MillicastEvent {
  type?: string;
  event?: string;
  timestamp?: number;
  data?: { name?: string; streamId?: string; feedId?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export function handleEvent(payload: unknown): { received: true; type: string | null; event: string | null } {
  const { type, event, data } = (payload && typeof payload === 'object' ? payload : {}) as MillicastEvent;
  switch (type) {
    case 'feeds':
      // data: feedId, accountId, name, streamId, active, and started or ended
      console.log(`Millicast stream ${data?.name} ${event}`);
      break;
    case 'recordings':
    case 'media':
      console.log(`Millicast media ${event}`);
      break;
    case 'transcoder':
      console.log(`Millicast transcoder ${event}`);
      break;
    case 'viewerConnection':
      console.log(`Millicast viewer connection ${event}`);
      break;
    default:
      console.log(`Millicast ${type} ${event}`);
  }
  // Events arrive asynchronously, so order isn't guaranteed.
  return { received: true, type: type ?? null, event: event ?? null };
}

/** Thumbnail hooks: the body is the JPEG; stream details come in x-millicast-* headers. */
export function handleThumbnail(jpeg: Buffer, streamId: string | null): { received: true; type: 'thumbnail'; bytes: number } {
  console.log(`Millicast thumbnail for stream ${streamId}: ${jpeg.length} bytes`);
  return { received: true, type: 'thumbnail', bytes: jpeg.length };
}
