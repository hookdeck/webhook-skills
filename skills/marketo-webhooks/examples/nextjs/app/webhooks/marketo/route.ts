// Generated with: marketo-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Marketo webhooks are sent by the "Call Webhook" step in a Smart Campaign flow.
// They are NOT signed: authenticate them with a shared secret YOU add through
// Webhook Actions > Set Custom Header (e.g. `X-Webhook-Secret: <hex>`). The body
// is the Payload Template the admin wrote, so each webhook hard-codes an `event`
// field (this skill's convention; Marketo defines no event-type strings).

const DEFAULT_HEADER = 'X-Webhook-Secret';

export const EVENTS = {
  LEAD_CREATED: 'lead_created',
  LEAD_UPDATED: 'lead_updated',
} as const;

interface MarketoLead {
  id?: string | number;
  email?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
}

interface MarketoPayload {
  event: string;
  campaign?: string;
  lead?: MarketoLead;
}

/**
 * Compare the shared secret from the custom header in constant time.
 * Throws when MARKETO_WEBHOOK_SECRET is unset so the route fails closed.
 */
export function verifyMarketoSecret(headerValue: string | null): boolean {
  const expected = process.env.MARKETO_WEBHOOK_SECRET;
  if (!expected) {
    throw new Error('MARKETO_WEBHOOK_SECRET is not set');
  }
  if (headerValue === null) return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  // Length check first: timingSafeEqual throws when lengths differ.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Marketo sends no delivery ID, so dedupe on fields from the payload template. */
export function dedupeKey(payload: MarketoPayload): string | null {
  const leadId = payload.lead?.id;
  if (!leadId) return null;
  return `${payload.event}:${leadId}:${payload.campaign ?? ''}`;
}

async function handleLeadCreated(lead: MarketoLead) {
  console.log(`Lead created: #${lead.id} ${lead.email ?? 'unknown'} (${lead.company ?? 'no company'})`);
  // TODO: create the record in your system. Upsert on lead.id.
}

async function handleLeadUpdated(lead: MarketoLead) {
  console.log(`Lead updated: #${lead.id} ${lead.email ?? 'unknown'}`);
  // TODO: sync the change, upserting on lead.id.
}

/** Dispatch on the `event` field. Returns whether the event was recognised. */
export async function dispatch(payload: MarketoPayload): Promise<boolean> {
  const lead = payload.lead && typeof payload.lead === 'object' ? payload.lead : {};
  switch (payload.event) {
    case EVENTS.LEAD_CREATED:
      await handleLeadCreated(lead);
      return true;
    case EVENTS.LEAD_UPDATED:
      await handleLeadUpdated(lead);
      return true;
    default:
      // Acknowledge unknown events with a 200.
      console.warn(`Unhandled Marketo event: ${payload.event}`);
      return false;
  }
}

export async function POST(request: NextRequest) {
  const headerName = process.env.MARKETO_WEBHOOK_HEADER || DEFAULT_HEADER;

  // Check the shared secret BEFORE reading the body.
  let ok: boolean;
  try {
    // Headers.get() is case-insensitive.
    ok = verifyMarketoSecret(request.headers.get(headerName));
  } catch (err) {
    console.error(`Marketo webhook misconfigured: ${(err as Error).message}`);
    return new NextResponse('Webhook secret not configured', { status: 500 });
  }
  if (!ok) {
    console.error(`Marketo webhook rejected: ${headerName} missing or wrong`);
    return new NextResponse('Invalid webhook secret', { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    // Form/Url encoding, or a token value that broke the JSON template.
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof (payload as MarketoPayload).event !== 'string'
  ) {
    return new NextResponse('Missing event field', { status: 400 });
  }
  const event = payload as MarketoPayload;

  console.log(
    `Marketo webhook: event=${event.event} campaign=${event.campaign ?? 'n/a'} key=${dedupeKey(event)}`
  );

  try {
    await dispatch(event);
  } catch (err) {
    console.error(`Marketo webhook processing failed: ${(err as Error).message}`);
    return new NextResponse('Processing failed', { status: 500 });
  }

  return NextResponse.json({ received: true });
}
