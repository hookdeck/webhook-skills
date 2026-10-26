// Generated with: ardoq-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

const SIGNATURE_PREFIX = 'sha256=';
const HEX_DIGEST_RE = /^[0-9a-fA-F]{64}$/;
const UNIX_SECONDS_RE = /^[0-9]+$/;

// Ardoq's own examples reject deliveries older than 5 minutes, but Hookdeck
// retries and replays resend the ORIGINAL headers and timestamp (and Hookdeck
// applies no tolerance itself), so a fixed window would reject legitimate
// retries. The check is OFF by default; set ARDOQ_WEBHOOK_TOLERANCE_SECONDS to
// opt in. Read at call time so it can be changed without a restart in tests.
export function defaultTolerance(): number {
  const n = Number.parseInt(process.env.ARDOQ_WEBHOOK_TOLERANCE_SECONDS || '0', 10);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Verify an Ardoq webhook signature.
 *
 * Ardoq sends `X-Ardoq-Signature-256: sha256=<hex>` and `X-Ardoq-Timestamp:
 * <unix seconds>`. The digest is HMAC-SHA256(secret, "<timestamp>.<raw body>").
 * The message is built as BYTES: the timestamp header exactly as received
 * (latin1), a literal ".", then the raw body bytes untouched.
 */
export function verifyArdoqSignature(
  rawBody: Buffer,
  signatureHeader: string | null | undefined,
  timestampHeader: string | null | undefined,
  secret: string | undefined,
  toleranceSeconds: number = defaultTolerance()
): boolean {
  if (!secret || !signatureHeader || !timestampHeader) return false;

  // Accept the value with or without the "sha256=" prefix
  const digest = signatureHeader.startsWith(SIGNATURE_PREFIX)
    ? signatureHeader.slice(SIGNATURE_PREFIX.length)
    : signatureHeader;

  // Validate the format BEFORE decoding: Buffer.from(x, 'hex') silently drops
  // bad characters
  if (!HEX_DIGEST_RE.test(digest)) return false;

  // Optional staleness check (not enabled by default, see above)
  if (toleranceSeconds > 0) {
    if (!UNIX_SECONDS_RE.test(timestampHeader)) return false;
    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestampHeader));
    if (age > toleranceSeconds) return false;
  }

  const signedContent = Buffer.concat([
    Buffer.from(timestampHeader, 'latin1'),
    Buffer.from('.', 'utf8'),
    rawBody,
  ]);
  const expected = crypto.createHmac('sha256', secret).update(signedContent).digest();

  // Hex is case-insensitive, so decode to bytes and compare in constant time
  const provided = Buffer.from(digest.toLowerCase(), 'hex');
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

export interface ArdoqEvent {
  'resource-type'?: string;
  'resource-id'?: string;
  'event-type'?: string;
  organization?: string;
  'organization-label'?: string;
  data?: { name?: string; [key: string]: unknown };
}

/**
 * Dispatch a verified Ardoq event on `resource-type`, then `event-type`.
 *
 * Signed webhooks only deliver component, reference and tag changes. Ardoq's
 * docs show `create` as an `event-type`; log whatever else arrives rather than
 * assuming a list. There are no deletion events.
 *
 * Returns what was handled, e.g. "tag:create" or "unhandled:<type>".
 */
export function handleArdoqEvent(event: ArdoqEvent): string {
  const resourceType = event['resource-type'];
  const eventType = event['event-type'];
  const label = `${resourceType}:${eventType}`;

  switch (resourceType) {
    case 'component':
      console.log(`Component ${event['resource-id']} ${eventType}`);
      // TODO: sync the component into your CMDB / catalog
      return label;

    case 'reference':
      console.log(`Reference ${event['resource-id']} ${eventType}`);
      // TODO: update dependency links between components
      return label;

    case 'tag':
      console.log(`Tag ${event.data?.name ?? event['resource-id']} ${eventType}`);
      // TODO: re-classify the tagged components (data.components)
      return label;

    default:
      console.log(`Unhandled Ardoq resource-type: ${resourceType}`);
      return `unhandled:${resourceType}`;
  }
}
