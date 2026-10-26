// Generated with: morta-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Optional replay window in seconds. Off by default (0): retries and replays, including
// Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
// Set MORTA_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
// treated as 0, with a warning.
let warnedInvalidTolerance = false;
function timestampToleranceSeconds(): number {
  const raw = (process.env.MORTA_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (raw === '') return 0;
  if (!/^\d+$/.test(raw)) {
    if (!warnedInvalidTolerance) {
      console.warn(`MORTA_WEBHOOK_TOLERANCE_SECONDS=${JSON.stringify(raw)} is not a whole number of seconds; the timestamp check is off`);
      warnedInvalidTolerance = true;
    }
    return 0;
  }
  return Number(raw);
}
timestampToleranceSeconds(); // surface an invalid value at startup

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

/**
 * Verify a Morta webhook signature.
 *
 * Header: `Morta-Signature: t=<unix seconds>,v1=<hex>`
 * v1 = hex HMAC-SHA256 over `<t>.<raw body>`, keyed with the hub signing secret as UTF-8 text.
 * More than one v1 may be present (key rotation): any match is enough. Other keys are ignored.
 */
export function verifyMortaWebhook(
  rawBody: Uint8Array,
  header: string | null,
  secret: string,
  toleranceSeconds = timestampToleranceSeconds(),
  nowSeconds = Date.now() / 1000
): boolean {
  if (!header || !secret) return false;
  const pairs = header.split(',').map((part): [string, string] => {
    const i = part.indexOf('=');
    return i < 0 ? [part.trim(), ''] : [part.slice(0, i).trim(), part.slice(i + 1).trim()];
  });
  // `t` is signed exactly as it appears in the header: keep it a string
  const t = pairs.find(([k]) => k === 't')?.[1];
  // Validate the format (64 hex chars) before comparing; skip other keys such as v0
  const signatures = pairs
    .filter(([k, v]) => k === 'v1' && HEX_SHA256.test(v))
    .map(([, v]) => v.toLowerCase());
  if (!t || signatures.length === 0) return false;

  // Opt-in replay window (`t` is Unix seconds)
  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(t) || Math.abs(nowSeconds - Number(t)) > toleranceSeconds) return false;
  }

  const expected = Buffer.from(
    crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest('hex')
  );
  // Both sides are 64 ASCII bytes, so timingSafeEqual cannot throw on length
  return signatures.some((sig) => crypto.timingSafeEqual(Buffer.from(sig), expected));
}

export const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

// `change` is a JSON-encoded string (or null): parse it a second time, tolerating bad data
function parseChange(change: unknown): Record<string, unknown> | null {
  if (typeof change !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(change);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Dispatch on the body's `event` field. Every field is untrusted: check its type before use.
export function handleMortaEvent(body: Record<string, unknown>): void {
  const { event, resourceId, context } = body;
  const change = parseChange(body.change);
  const id = typeof resourceId === 'string' ? resourceId : 'unknown';
  const ctx = isObject(context) ? context : {};

  switch (event) {
    case 'table.row_created': {
      const rows = Array.isArray(ctx.rows) ? ctx.rows.length : 0;
      const added = typeof change?.added === 'number' ? change.added : rows;
      console.log(`Table ${id}: ${added} row(s) created`);
      break;
    }
    case 'table.row_updated':
      console.log(`Table ${id}: row(s) updated`);
      break;
    case 'project.created':
      console.log(`Hub created: ${id}`);
      break;
    case 'project.duplication_failed':
      console.log(`Hub duplication failed for ${id}: ${typeof change?.error === 'string' ? change.error : 'unknown error'}`);
      break;
    case 'member.created':
      console.log(`Member added to hub ${id}`);
      break;
    case 'process.response_submitted':
      console.log(`Document response submitted: ${id}`);
      break;
    default:
      console.log(`Unhandled event type: ${typeof event === 'string' ? event : 'missing'}`);
  }
  // TODO: persist / forward. `id` (the event's unique public ID) is a good idempotency key.
}
