// Generated with: recall-ai-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

// Standard Webhooks recommends rejecting timestamps more than 5 minutes off.
// Recall.ai's own sample doesn't enforce a window; pass 0 to disable it.
export const TOLERANCE_SECONDS = 300;

export interface RecallEvent {
  event: string;
  data: Record<string, any>;
}

export interface SignatureHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

/**
 * Pick the header set Recall.ai sent.
 *
 * Workspace verification secret -> webhook-id / webhook-timestamp / webhook-signature
 * Legacy Svix endpoint secret (accounts created before 2025-12-15) -> svix-*
 */
export function getSignatureHeaders(headers: Headers): SignatureHeaders {
  const prefix = headers.has('webhook-signature') ? 'webhook' : 'svix';
  return {
    id: headers.get(`${prefix}-id`),
    timestamp: headers.get(`${prefix}-timestamp`),
    signature: headers.get(`${prefix}-signature`),
  };
}

/**
 * Verify a Recall.ai webhook (Standard Webhooks / Svix scheme).
 *
 * Signed content: `${id}.${timestamp}.${rawBody}` (raw body, not re-serialised JSON)
 * Key:            base64-decoded part of the secret after `whsec_`
 * Algorithm:      HMAC-SHA256, base64 digest
 * Header:         space-delimited list of `v1,<base64>` (several during secret rotation)
 */
export function verifyRecallSignature(
  rawBody: string,
  headers: Headers,
  secret: string | undefined,
  toleranceSeconds = TOLERANCE_SECONDS,
  nowSeconds = Math.floor(Date.now() / 1000)
): { valid: true } | { valid: false; error: string } {
  if (!secret || !secret.startsWith('whsec_')) {
    return { valid: false, error: 'Verification secret is missing or not whsec_-prefixed' };
  }

  const { id, timestamp, signature } = getSignatureHeaders(headers);
  if (!id || !timestamp || !signature) {
    return { valid: false, error: 'Missing webhook-id, webhook-timestamp or webhook-signature header' };
  }

  if (!/^[0-9]+$/.test(timestamp)) {
    return { valid: false, error: 'Invalid timestamp' };
  }
  if (toleranceSeconds > 0 && Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) {
    return { valid: false, error: 'Timestamp outside tolerance' };
  }

  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest();

  // Accept if ANY v1 signature matches (Recall sends one per active secret after a rotation)
  const matched = signature.split(' ').some((versioned) => {
    const [version, sig] = versioned.split(',');
    if (version !== 'v1' || !sig) return false;
    const sigBytes = Buffer.from(sig, 'base64');
    return sigBytes.length === expected.length && crypto.timingSafeEqual(sigBytes, expected);
  });

  return matched ? { valid: true } : { valid: false, error: 'No matching signature found' };
}
