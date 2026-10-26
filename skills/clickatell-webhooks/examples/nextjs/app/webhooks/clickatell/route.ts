// Generated with: clickatell-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyClickatellRequest } from '../../../lib/verify-clickatell';

type ClickatellEvent = Record<string, unknown>;

interface ClickatellPayload {
  integrationId?: string;
  integrationName?: string;
  event: Record<string, unknown>;
}

// One handler per event kind: the name of the key inside `event`. Each value is an array.
const handlers: Record<string, (e: ClickatellEvent) => void> = {
  messageStatusUpdate: (e) => {
    console.log(`Message ${e.messageId} status: ${e.status} (${e.statusCode})`);
    // TODO: update delivery state; events can repeat or arrive out of order (use e.timestamp)
  },
  messageFallback: (e) => {
    console.log(`Message ${e.messageId} fallback: ${e.status}`);
    // TODO: record the channel fallback
  },
  statusIsTyping: (e) => {
    console.log(`${e.from} is typing`);
    // TODO: show a typing indicator
  },
  moText: (e) => {
    console.log(`Text from ${e.from}: ${e.content}`);
    // TODO: route to your bot or inbox
  },
  moMedia: (e) => {
    const files = e.files as { contentType?: string }[] | undefined;
    console.log(`Media from ${e.from}: ${e.contentType ?? files?.[0]?.contentType}`);
    // TODO: download e.files[].downloadUrl and store it
  },
  moLocation: (e) => {
    console.log(`Location from ${e.from}: ${e.locationName}`);
    // TODO: use e.latitute / e.longitude (the docs spell it "latitute")
  },
  moContacts: (e) => {
    const contacts = (e.contacts as unknown[] | undefined) ?? [];
    console.log(`Contacts from ${e.from}: ${contacts.length}`);
    // TODO: import e.contacts
  },
  moSuggestedResponse: (e) => {
    console.log(`Suggested response from ${e.from}: ${e.postbackData}`);
    // TODO: continue the flow using e.postbackData
  },
  moListPickerResponse: (e) => {
    console.log(`List selection from ${e.from}`);
    // TODO: continue the flow using e.selectedItems
  },
  moButtonResponse: (e) => {
    console.log(`Button response from ${e.from}`);
    // TODO: continue the flow using e.selectedItem
  },
};

function handleEvent(payload: ClickatellPayload): void {
  for (const [kind, events] of Object.entries(payload.event)) {
    const handler = handlers[kind];
    if (!handler) {
      console.log(`Unhandled event: ${kind}`);
      continue;
    }
    for (const e of Array.isArray(events) ? events : []) handler(e as ClickatellEvent);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyClickatellRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing security header' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read as text so any content type is accepted.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const event = (payload as { event?: unknown } | null)?.event;
  if (
    !payload || typeof payload !== 'object' || Array.isArray(payload) ||
    !event || typeof event !== 'object' || Array.isArray(event)
  ) {
    return NextResponse.json({ error: 'Expected a JSON object with an event object' }, { status: 400 });
  }

  try {
    handleEvent(payload as ClickatellPayload);
  } catch (err) {
    console.error('Error handling Clickatell event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
