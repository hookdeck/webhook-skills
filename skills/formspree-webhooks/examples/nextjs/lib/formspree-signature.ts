// Generated with: formspree-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

const HEX_64 = /^[0-9a-fA-F]{64}$/;
const DECIMAL = /^[0-9]+$/;

export interface VerifyResult {
  valid: boolean;
  error?: string;
}

/**
 * Parse Formspree-Signature: "t=<unix>,v1=<hex>". The header can carry more
 * than one v1= entry (key rotation) and other keys such as v0, which are ignored.
 */
export function parseSignatureHeader(header: string) {
  let timestamp: string | undefined;
  let timestampCount = 0;
  const signatures: string[] = [];

  for (const field of header.split(',')) {
    const separator = field.indexOf('=');
    if (separator === -1) continue;
    const key = field.slice(0, separator).trim();
    const value = field.slice(separator + 1).trim();
    if (key === 't') {
      timestamp = value;
      timestampCount += 1;
    } else if (key === 'v1') {
      signatures.push(value);
    }
  }

  return { timestamp, timestampCount, signatures };
}

/** Opt-in replay window in seconds. Unset, 0 or invalid = off (the default). */
export function toleranceFromEnv(): number {
  const seconds = Number(process.env.FORMSPREE_WEBHOOK_TOLERANCE_SECONDS);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

/**
 * Verify a Formspree webhook signature.
 *
 * Signed content: `${t}.` + raw body bytes (t exactly as it appears in the header)
 * Algorithm:      HMAC-SHA256 keyed with the secret's UTF-8 bytes, hex digest
 */
export function verifyFormspreeSignature(
  rawBody: Buffer,
  header: string | null | undefined,
  secret: string,
  toleranceSeconds: number = toleranceFromEnv(),
  nowSeconds: number = Math.floor(Date.now() / 1000)
): VerifyResult {
  if (!header) {
    return { valid: false, error: 'Missing Formspree-Signature header' };
  }

  const { timestamp, timestampCount, signatures } = parseSignatureHeader(header);
  if (timestampCount !== 1 || !timestamp || signatures.length === 0) {
    return { valid: false, error: 'Malformed Formspree-Signature header' };
  }

  if (toleranceSeconds > 0) {
    if (!DECIMAL.test(timestamp) || Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) {
      return { valid: false, error: 'Timestamp outside tolerance' };
    }
  }

  // Only well-formed candidates reach Buffer.from(..., 'hex'), which would
  // otherwise silently drop bad characters.
  const candidates = signatures.filter((sig) => HEX_64.test(sig));
  if (candidates.length === 0) {
    return { valid: false, error: 'Malformed Formspree-Signature header' };
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest();

  // Accept when ANY v1 entry matches; check them all so timing doesn't reveal which.
  let matched = false;
  for (const sig of candidates) {
    const received = Buffer.from(sig.toLowerCase(), 'hex');
    matched = crypto.timingSafeEqual(received, expected) || matched;
  }

  return matched ? { valid: true } : { valid: false, error: 'Invalid signature' };
}

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// Retries resend identical bytes, so the body hash identifies a delivery.
// Use a shared store (Redis, a unique DB column) in production.
export const seenDeliveries = new Set<string>();
export const deliveryKey = (rawBody: Buffer): string =>
  crypto.createHash('sha256').update(rawBody).digest('hex');

/**
 * Every delivery is a new form submission: there is no event name field or header.
 * Treat every field as untrusted even after the signature check.
 */
export function handleSubmission(payload: Record<string, unknown>) {
  const form = typeof payload.form === 'string' ? payload.form : undefined;
  const keys = Array.isArray(payload.keys)
    ? payload.keys.filter((k): k is string => typeof k === 'string')
    : [];
  const submission = isPlainObject(payload.submission) ? payload.submission : {};

  const date = typeof submission._date === 'string' ? submission._date : undefined;
  console.log(`Form submission on ${form ?? 'unknown form'} at ${date ?? 'unknown time'}`);

  for (const key of keys) {
    const value = submission[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      console.log(`  ${key}: ${value}`);
    }
  }
}
