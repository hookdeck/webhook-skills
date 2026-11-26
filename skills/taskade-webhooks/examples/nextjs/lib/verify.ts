import crypto from 'crypto';

// Taskade's docs reject a delivery whose timestamp is more than 5 minutes from your clock
const TOLERANCE_SECONDS = 5 * 60;

/**
 * Verify a Taskade webhook signature.
 * `signatureHeader` is X-Taskade-Signature-V2 (sha256=<hex>), the HMAC-SHA256 of
 * "<X-Taskade-Timestamp>.<raw body>". `timestampHeader` is X-Taskade-Timestamp (unix seconds).
 */
export function verifyTaskadeWebhook(
  rawBody: Buffer,
  signatureHeader: string | null | undefined,
  timestampHeader: string | null | undefined,
  secret: string | undefined,
  nowSeconds: number = Date.now() / 1000
): boolean {
  if (!signatureHeader || !timestampHeader || !secret) {
    return false;
  }
  if (!/^\d+$/.test(timestampHeader)) {
    return false;
  }

  // Accept the value with or without the "sha256=" prefix
  const sig = signatureHeader.trim().replace(/^sha256=/i, '');

  // Validate the format before decoding: Buffer.from(x, 'hex') silently drops bad characters
  if (!/^[0-9a-f]{64}$/i.test(sig)) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestampHeader}.`)
    .update(rawBody)
    .digest();
  if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected)) {
    return false;
  }

  return Math.abs(nowSeconds - Number(timestampHeader)) <= TOLERANCE_SECONDS;
}

// No field or header names the event. In Taskade's Delivery payload table, each event
// has a top-level field the other five don't. Or register one URL per event.
const EVENT_MARKERS: [string, string][] = [
  ['task.assigned', 'assignedNodes'],
  ['comment.created', 'commentBody'],
  ['project.created', 'creatorName'],
  ['project.assigned', 'assigneeId'],
  ['project.joined', 'joinerUserId'],
  ['task.due', 'taskEndDate'],
];

/** Work out which Taskade event a delivery is from its fields. */
export function taskadeEventType(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined;
  }
  const match = EVENT_MARKERS.find(([, field]) => Object.prototype.hasOwnProperty.call(payload, field));
  return match ? match[0] : undefined;
}
