// Generated with: sendx-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// SendX puts an INTEGER code in the body's top-level `type` (one code per sending surface)
export const SENDX_EVENTS: Record<number, string> = {
  74: 'ContactCreated',
  73: 'GlobalUnsubscribe',
  7: 'MailOpen', 32: 'DripStepMailOpen', 172: 'RssExecMailOpen', 189: 'WorkflowEmailMailOpen', 271: 'SeedContactMailOpen',
  8: 'LinkClick', 33: 'DripStepLinkClick', 173: 'RssExecLinkClick', 190: 'WorkflowEmailLinkClick', 272: 'SeedContactLinkClick',
  5: 'MailBounced', 63: 'DripStepMailBounced', 180: 'RssExecMailBounced', 197: 'WorkflowEmailMailBounced', 276: 'SeedContactMailBounced',
  6: 'MailSpam', 62: 'DripStepMailSpam', 179: 'RssExecMailSpam', 196: 'WorkflowEmailMailSpam', 275: 'SeedContactMailSpam',
  60: 'MailDropped', 61: 'DripStepMailDropped', 178: 'RssExecMailDropped', 195: 'WorkflowEmailMailDropped', 278: 'SeedContactMailDropped',
};

/**
 * Verify a SendX webhook signature.
 *
 * SendX sends `X-SendX-Signature: <hex>`, the bare lowercase hex HMAC-SHA256 of the raw request
 * body, keyed with the team API key (UTF-8 bytes, used as-is). No timestamp is signed.
 */
export function verifySendxSignature(
  rawBody: Buffer,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (typeof signatureHeader !== 'string') return false;
  // Check the hex shape first: Buffer.from(x, 'hex') silently drops invalid characters
  if (!/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signatureHeader.toLowerCase(), 'hex'), expected);
}

/** Return the integer `type` code, or null if the body has none (the field is untrusted). */
export function getEventType(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const type = (payload as Record<string, unknown>).type;
  if (typeof type === 'number' && Number.isInteger(type)) return type;
  if (typeof type === 'string' && /^\d+$/.test(type)) return Number(type);
  return null;
}
