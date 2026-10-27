// Generated with: webiny-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

// Webiny 6 signs with Standard Webhooks headers (webhook-id, webhook-timestamp,
// webhook-signature). Signed content: `${id}.${timestamp}.${rawBody}`.
// Key: the admin-entered secret's raw UTF-8 bytes; only a secret that already
// starts with `whsec_` is treated as Standard Webhooks base64.
//
// Do NOT use the standardwebhooks or svix libraries: they base64-decode the
// secret, so a free-text Webiny secret would produce the wrong key.

export interface VerifyResult {
  valid: boolean;
  error?: string;
}

/** Resolve the HMAC key from the secret as entered in Webiny. Null = unusable. */
export function resolveKey(secret: string | undefined): Buffer | null {
  if (!secret) return null;
  const key = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice('whsec_'.length), 'base64')
    : Buffer.from(secret, 'utf8');
  return key.length > 0 ? key : null; // an empty key is never accepted
}

/** Read the webhook-* headers; fall back to svix-* when webhook-id is absent. */
export function readSignatureHeaders(headers: Headers) {
  const prefix = headers.get('webhook-id') ? 'webhook' : 'svix';
  return {
    id: headers.get(`${prefix}-id`),
    timestamp: headers.get(`${prefix}-timestamp`),
    signature: headers.get(`${prefix}-signature`),
  };
}

export function verifyWebinyWebhook(
  rawBody: Buffer,
  headers: Headers,
  secret: string | undefined,
  toleranceSeconds = 0
): VerifyResult {
  const key = resolveKey(secret);
  if (!key) return { valid: false, error: 'Signing secret missing or empty' };

  const { id, timestamp, signature } = readSignatureHeaders(headers);
  if (!id || !timestamp || !signature) return { valid: false, error: 'Missing signature headers' };
  if (!/^[1-9][0-9]*$/.test(timestamp)) return { valid: false, error: 'Invalid timestamp' };

  if (toleranceSeconds > 0) {
    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (age > toleranceSeconds) return { valid: false, error: 'Timestamp outside tolerance' };
  }

  const expected = crypto
    .createHmac('sha256', key)
    .update(Buffer.concat([Buffer.from(`${id}.${timestamp}.`, 'utf8'), rawBody]))
    .digest();

  // Accept any v1 entry that matches; ignore other versions (v1a, ...).
  const ok = signature.split(' ').some((entry) => {
    const [version, value] = entry.split(',');
    if (version !== 'v1' || !value) return false;
    const received = Buffer.from(value, 'base64');
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
  return ok ? { valid: true } : { valid: false, error: 'Signature mismatch' };
}
