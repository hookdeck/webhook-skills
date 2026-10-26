// Generated with: plunk-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time string comparison. Lengths are checked first because timingSafeEqual
 * throws on unequal lengths.
 */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Plunk does not sign webhooks. You add a secret header on the workflow's webhook step;
 * the header name is yours (PLUNK_WEBHOOK_HEADER, default Authorization) and the expected
 * value is the WHOLE header value (PLUNK_WEBHOOK_SECRET), including any "Bearer " prefix.
 * No prefix is stripped or parsed.
 */
export function verifyPlunkRequest(
  headers: Headers,
  secret: string | undefined = process.env.PLUNK_WEBHOOK_SECRET,
  headerName: string = process.env.PLUNK_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName); // Headers.get is case-insensitive
  return Boolean(received) && safeEqual(received as string, secret);
}

/**
 * The wire has no Plunk-defined event-name field: the trigger (email.bounce, ...) only
 * selects the workflow. For the default body we infer the kind from the documented
 * fields of body.event. A custom body replaces the default entirely, so this may be null.
 */
export function classifyEvent(event: unknown): string | null {
  if (!event || typeof event !== 'object') return null;
  const e = event as Record<string, unknown>;
  if ('bouncedAt' in e || 'bounceType' in e) return 'email.bounce';
  if ('complainedAt' in e) return 'email.complaint';
  if ('clickedAt' in e) return 'email.click';
  if ('openedAt' in e) return 'email.open';
  if ('deliveredAt' in e) return 'email.delivery';
  if ('sentAt' in e) return 'email.sent';
  if ('spfVerdict' in e || 'recipients' in e) return 'email.received';
  if ('segmentId' in e) return 'segment';
  return null;
}
