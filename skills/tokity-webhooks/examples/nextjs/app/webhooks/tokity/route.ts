// Generated with: tokity-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyTokitySignature } from '../../../lib/verify-tokity';

type JsonObject = Record<string, unknown>;

const isObject = (v: unknown): v is JsonObject =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): string =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : 'unknown';

/**
 * Tokity payloads carry no event name. A chat webhook item is a chat session
 * (status plus pastStatus). Anything else is a ticket: a webhook item is the ticket plus
 * `from` (its previous state, null on creation); an Events action sends the ticket without `from`.
 */
function classify(item: JsonObject): 'chat' | 'ticket_change' {
  return typeof item.status === 'string' && Array.isArray(item.pastStatus) ? 'chat' : 'ticket_change';
}

function handleChat(chat: JsonObject): void {
  const past = (Array.isArray(chat.pastStatus) ? chat.pastStatus : []).filter(
    (s): s is string => typeof s === 'string'
  );
  const ref = isObject(chat.reference) ? chat.reference : null;
  console.log(`Chat session ${text(chat.id)} is ${text(chat.status)} (past: ${past.join(', ') || 'none'})`);
  if (ref && ref.type === 'ticket') {
    console.log(`  about ticket ${text(ref.id)}`);
  }
  // TODO: notify technicians, or follow up on 'missed' / 'callback' sessions
}

function handleTicket(ticket: JsonObject): void {
  const id = text(ticket.id);
  if (Object.hasOwn(ticket, 'from') && ticket.from === null) {
    console.log(`Ticket ${id} created`);
    // TODO: act on the new ticket
  } else if (isObject(ticket.from)) {
    const previous = ticket.from;
    const changed = Object.keys(ticket).filter(
      (key) => key !== 'from' && JSON.stringify(ticket[key]) !== JSON.stringify(previous[key])
    );
    console.log(`Ticket ${id} changed: ${changed.join(', ') || 'no fields'}`);
    // TODO: act on the fields that changed
  } else {
    console.log(`Ticket ${id} event (no previous state, sent by a Tokity Events action)`);
  }
}

function handleItem(item: JsonObject): void {
  if (classify(item) === 'chat') {
    handleChat(item);
  } else {
    handleTicket(item);
  }
}

export async function POST(request: NextRequest) {
  // Read the exact bytes: the signature covers them, whatever Content-Type Tokity uses.
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyTokitySignature(rawBody, request.headers.get('x-dd-signature'))) {
    return NextResponse.json({ error: 'Invalid or missing x-dd-signature' }, { status: 401 });
  }

  // Parse only after the signature check. Treat everything in the body as untrusted.
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Chat webhooks send an array; ticket webhooks may too. Accept one object or a list.
  const items: unknown[] = Array.isArray(payload) ? payload : [payload];
  if (!items.every(isObject)) {
    return NextResponse.json({ error: 'Expected a JSON object or an array of objects' }, { status: 400 });
  }

  try {
    (items as JsonObject[]).forEach(handleItem);
  } catch (err) {
    console.error('Error handling Tokity webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
