// Generated with: freshdesk-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Freshdesk webhooks are a "Trigger Webhook" action inside automation rules.
// They are NOT signed: authenticate them with a shared secret YOU add under
// "Add custom headers" (e.g. `X-Freshdesk-Webhook-Secret: <hex>`). The body is
// whatever the rule's Advanced content says, so each rule hard-codes an `event`
// field (this skill's convention; Freshdesk defines no event-type strings).

const DEFAULT_HEADER = 'X-Freshdesk-Webhook-Secret';

export const EVENTS = {
  TICKET_CREATED: 'ticket_created',
  TICKET_UPDATED: 'ticket_updated',
} as const;

interface FreshdeskTicket {
  id?: string | number;
  subject?: string;
  status?: string;
  priority?: string;
  requester_email?: string;
  url?: string;
}

interface FreshdeskPayload {
  event: string;
  triggered_event?: string;
  ticket?: FreshdeskTicket;
}

/**
 * Compare the shared secret from the custom header in constant time.
 * Throws when FRESHDESK_WEBHOOK_SECRET is unset so the route fails closed.
 */
export function verifyFreshdeskSecret(headerValue: string | null): boolean {
  const expected = process.env.FRESHDESK_WEBHOOK_SECRET;
  if (!expected) {
    throw new Error('FRESHDESK_WEBHOOK_SECRET is not set');
  }
  if (headerValue === null) return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  // Length check first: timingSafeEqual throws when lengths differ.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Freshdesk has no delivery ID and retries 48 times, so dedupe on body fields. */
export function dedupeKey(payload: FreshdeskPayload): string | null {
  const ticketId = payload.ticket?.id;
  if (!ticketId) return null;
  return `${payload.event}:${ticketId}:${payload.ticket?.status ?? ''}`;
}

async function handleTicketCreated(ticket: FreshdeskTicket) {
  console.log(`Ticket created: #${ticket.id} "${ticket.subject ?? ''}" from ${ticket.requester_email ?? 'unknown'}`);
  // TODO: create the record in your system. Re-fetch the ticket from the
  // Freshdesk API before acting on it.
}

async function handleTicketUpdated(ticket: FreshdeskTicket) {
  console.log(`Ticket updated: #${ticket.id} status=${ticket.status ?? 'n/a'} priority=${ticket.priority ?? 'n/a'}`);
  // TODO: sync the change, upserting on ticket.id.
}

/** Dispatch on the `event` field. Returns whether the event was recognised. */
export async function dispatch(payload: FreshdeskPayload): Promise<boolean> {
  const ticket = payload.ticket && typeof payload.ticket === 'object' ? payload.ticket : {};
  switch (payload.event) {
    case EVENTS.TICKET_CREATED:
      await handleTicketCreated(ticket);
      return true;
    case EVENTS.TICKET_UPDATED:
      await handleTicketUpdated(ticket);
      return true;
    default:
      // Acknowledge unknown events so Freshdesk doesn't retry them.
      console.warn(`Unhandled Freshdesk event: ${payload.event}`);
      return false;
  }
}

export async function POST(request: NextRequest) {
  const headerName = process.env.FRESHDESK_WEBHOOK_HEADER || DEFAULT_HEADER;

  // Check the shared secret BEFORE reading the body.
  let ok: boolean;
  try {
    // Headers.get() is case-insensitive, matching Freshdesk's header handling.
    ok = verifyFreshdeskSecret(request.headers.get(headerName));
  } catch (err) {
    console.error(`Freshdesk webhook misconfigured: ${(err as Error).message}`);
    return new NextResponse('Webhook secret not configured', { status: 500 });
  }
  if (!ok) {
    console.error(`Freshdesk webhook rejected: ${headerName} missing or wrong`);
    return new NextResponse('Invalid webhook secret', { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    // XML encoding, or a placeholder value that broke the JSON template.
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof (payload as FreshdeskPayload).event !== 'string'
  ) {
    return new NextResponse('Missing event field', { status: 400 });
  }
  const event = payload as FreshdeskPayload;

  console.log(
    `Freshdesk webhook: event=${event.event} triggered_event=${event.triggered_event ?? 'n/a'} key=${dedupeKey(event)}`
  );

  try {
    await dispatch(event);
  } catch (err) {
    console.error(`Freshdesk webhook processing failed: ${(err as Error).message}`);
    // Non-2xx makes Freshdesk retry every 30 minutes (48 calls in total).
    return new NextResponse('Processing failed', { status: 500 });
  }

  return NextResponse.json({ received: true });
}
