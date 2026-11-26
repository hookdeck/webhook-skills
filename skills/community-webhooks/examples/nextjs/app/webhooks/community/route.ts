// Generated with: community-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Community's docs specify NO tolerance window for the signature timestamp, so
// the staleness check is OFF by default. Enabling it is your own hardening
// choice — keep any window well above an hour, since Community retries a failed
// delivery for up to an hour from the first attempt.
const TOLERANCE_SECONDS = parseInt(
  process.env.COMMUNITY_WEBHOOK_TOLERANCE_SECONDS || '0',
  10
);

export interface ParsedSignature {
  timestamp: string;
  signature: string;
}

/**
 * Parse a `community-signature` header of the form `t=<unix>,v1=<hex>`.
 *
 * Splits on `,` then on the first `=` so field order does not matter. Only the
 * `v1` scheme is defined; any other version is treated as unsupported.
 */
export function parseSignatureHeader(header: string): ParsedSignature | null {
  const fields: Record<string, string> = {};
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    fields[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }

  const timestamp = fields.t;
  const signature = fields.v1;
  if (!timestamp || !signature) return null;

  return { timestamp, signature };
}

/**
 * Verify a Community webhook signature.
 *
 * Community signs `{timestamp}.{raw_body}` with HMAC-SHA256 using the webhook's
 * signature secret and sends the result as
 * `community-signature: t=<unix_seconds>,v1=<lowercase_hex>`.
 */
export function verifyCommunitySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined,
  toleranceSeconds: number = TOLERANCE_SECONDS
): boolean {
  if (!signatureHeader || !secret) return false;

  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) return false;

  const { timestamp, signature } = parsed;

  // Optional staleness check (not a documented Community requirement)
  if (toleranceSeconds > 0) {
    const ts = Number.parseInt(timestamp, 10);
    if (Number.isNaN(ts)) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - ts) > toleranceSeconds) {
      return false;
    }
  }

  // Signed content is the timestamp, a literal ".", then the RAW body
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');

  // Hex is case-insensitive (0xAB === 0xab). Community's documented example is
  // lowercase, but normalize both sides before comparing rather than rejecting a
  // valid uppercase digest. `expected` is already lowercase — digest('hex') emits lowercase.
  // Constant-time comparison; timingSafeEqual throws on a length mismatch
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature.toLowerCase()),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

/**
 * Extract the event payload from a Community envelope.
 *
 * Every documented sample nests it at `data.object`, while the prose on the same
 * page describes `data.member` / `data.message`. Prefer the samples, fall back
 * defensively.
 */
function extractObject(event: any): any {
  const data = event?.data ?? {};
  return data.object ?? data.member ?? data.message ?? null;
}

// Deduplication store — Community delivers AT-LEAST-ONCE and documents that the
// same event can arrive more than once. Keep event ids for at least two hours, longer than the one-hour retry window.
// Replace with Redis/Postgres in production (module state is per-instance).
const DEDUPE_TTL_MS = 2 * 60 * 60 * 1000;
const seenEvents = new Map<string, number>();

function alreadyProcessed(eventId: string): boolean {
  const now = Date.now();
  for (const [id, seenAt] of seenEvents) {
    if (now - seenAt > DEDUPE_TTL_MS) seenEvents.delete(id);
  }
  if (seenEvents.has(eventId)) return true;
  seenEvents.set(eventId, now);
  return false;
}

export async function POST(request: NextRequest) {
  // Read the RAW body — Community signs the raw bytes, not parsed JSON
  const rawBody = await request.text();
  const signatureHeader = request.headers.get('community-signature');

  if (!signatureHeader) {
    return NextResponse.json(
      { error: 'Missing community-signature header' },
      { status: 400 }
    );
  }

  if (
    !verifyCommunitySignature(
      rawBody,
      signatureHeader,
      process.env.COMMUNITY_WEBHOOK_SECRET
    )
  ) {
    console.error('Community signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Deduplicate before doing any work — messages especially should be handled
  // at-most-once (better to not send than to send twice).
  if (event.id && alreadyProcessed(event.id)) {
    console.log(`Duplicate event ${event.id} ignored`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  const object = extractObject(event);

  switch (event.type) {
    case 'message.inbound': {
      const member = object?.member ?? {};
      console.log(
        `Inbound message ${object?.id} from ${member.communication_channel_id}: ${object?.text}`
      );
      // Your code: route to support inbox, run keyword automations
      break;
    }

    case 'message.outbound': {
      // The sample shows "automated" while the documented list is capitalized,
      // so compare case-insensitively.
      const kind = (object?.outbound_message_type ?? '').toLowerCase();
      console.log(`Outbound message ${object?.id} (type: ${kind})`);
      // Your code: log conversation history, attribute campaign sends
      break;
    }

    case 'member.created':
      console.log(`Member created: ${object?.id}`);
      // Your code: welcome flow, create the contact in your CRM
      break;

    case 'member.updated':
      console.log(`Member updated: ${object?.id} (active: ${object?.active})`);
      // Your code: sync profile changes downstream
      break;

    case 'member.deleted':
      // Sparse payload: only id, active, timestamp, client_id,
      // communication_channel, and an emptied communication_channel_id.
      console.log(`Member deleted: ${object?.id}`);
      // Your code: downstream deletion
      break;

    case 'member.opted_out': {
      // The member unsubscribed (for example by replying STOP). A member.updated
      // event for the same member arrives too, so don't treat them as duplicates.
      const optOut = object?.opt_out ?? {};
      console.log(`Member opted out: ${object?.id} (source: ${optOut.source})`);
      // Your code: add to your suppression list
      break;
    }

    default:
      console.log(`Unhandled Community event type: ${event.type}`);
  }

  // Community requires a 2xx within 15 seconds — acknowledge fast and do the
  // real work asynchronously.
  return NextResponse.json({ received: true });
}
