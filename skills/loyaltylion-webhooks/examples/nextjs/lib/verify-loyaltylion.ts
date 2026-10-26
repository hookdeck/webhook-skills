import crypto from 'crypto';

// x-loyaltylion-hmac-sha256 is the bare, padded, standard-base64 HMAC-SHA256 digest (44 chars).
const SIGNATURE_FORMAT = /^[A-Za-z0-9+/]{43}=$/;

/**
 * Verify the x-loyaltylion-hmac-sha256 header.
 * Signature = base64(HMAC-SHA256(secret, rawBody)): the raw body bytes only, key = the secret's
 * UTF-8 bytes. The format is checked first (the base64 string is never decoded), then the
 * base64 strings are compared exactly, in constant time.
 */
export function verifyLoyaltyLionSignature(
  rawBody: Buffer,
  signature: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!secret || typeof signature !== 'string' || !SIGNATURE_FORMAT.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export interface LoyaltyLionBody {
  id?: string;
  topic?: string;
  created_at?: string;
  payload?: Record<string, any>;
  [key: string]: any;
}

/**
 * Envelope webhooks carry `topic`. rewards/store_fulfilment (sent to a custom reward's
 * fulfilment URL) has no envelope and no topic: its body is the flat fulfilment object.
 */
export function getTopic(body: LoyaltyLionBody): string | undefined {
  if (typeof body.topic === 'string') return body.topic;
  if (body.reward_fulfilment_id !== undefined) return 'rewards/store_fulfilment';
  return undefined;
}

/** The docs' customers/update example puts `customer` at the top level instead of under `payload`. */
export function getData(body: LoyaltyLionBody): Record<string, any> {
  return body.payload && typeof body.payload === 'object' ? body.payload : body;
}

/** program_events/* payloads nest their fields under `properties`. */
export function getCustomer(data: Record<string, any>): Record<string, any> {
  return data.customer || data.properties?.customer || {};
}
