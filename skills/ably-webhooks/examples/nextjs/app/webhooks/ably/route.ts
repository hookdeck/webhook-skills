// Generated with: ably-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { decode } from '@msgpack/msgpack';

// Ably presence actions arrive as numbers in raw payloads
const PRESENCE_ACTIONS: Record<number, string> = { 0: 'absent', 1: 'present', 2: 'enter', 3: 'leave', 4: 'update' };

interface AblyEvent {
  source?: string;
  name?: string;
  channel?: string;
  messages?: { name?: string; clientId?: string }[];
  presence?: { clientId?: string; action?: number }[];
  data?: string;
}

// The HMAC key is the keyValue: the part of "appId.keyId:keyValue" AFTER the ":".
// Using the whole API key as the HMAC key is the most common cause of failures.
function keyValueOf(apiKey: string | undefined): string | null {
  const i = (apiKey ?? '').indexOf(':');
  return i === -1 ? null : apiKey!.slice(i + 1);
}

// X-Ably-Key names the API key that signed the request ("appId.keyId")
function keyMatches(headerKey: string | null, apiKey: string): boolean {
  if (!headerKey) return true;
  const id = apiKey.slice(0, apiKey.indexOf(':'));
  return headerKey === id || headerKey === id.split('.').pop();
}

function verifyAblySignature(rawBody: Buffer, signature: string, apiKey: string): boolean {
  const keyValue = keyValueOf(apiKey);
  if (!keyValue || !signature) return false;
  const expected = crypto.createHmac('sha256', keyValue).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // different lengths
  }
}

// Turn an Ably request into a flat list of events. Handles non-enveloped,
// enveloped and batched (items[]) requests.
function extractEvents(headers: Headers, rawBody: Buffer): AblyEvent[] {
  const envelopeSource = headers.get('x-ably-envelope-source');
  if (envelopeSource) {
    // Non-enveloped: metadata is in unsigned x-ably-envelope-* headers, body is the raw data
    return [{
      source: envelopeSource,
      channel: headers.get('x-ably-envelope-channel') ?? undefined,
      name: headers.get('x-ably-message-name') ?? undefined,
      data: rawBody.toString('utf8'),
    }];
  }
  const type = headers.get('content-type') ?? '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: any = type.includes('msgpack') ? decode(rawBody) : JSON.parse(rawBody.toString('utf8'));
  if (Array.isArray(payload.items)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return payload.items.map((item: any) => ({
      source: item.source,
      name: item.name,
      channel: item.data?.channelId,
      messages: item.data?.messages,
      presence: item.data?.presence,
    }));
  }
  return [{
    source: payload.source,
    name: payload.name,
    channel: payload.channel,
    messages: payload.messages,
    presence: payload.presence,
  }];
}

function handleEvent(event: AblyEvent) {
  switch (event.source) {
    case 'channel.message':
      for (const m of event.messages ?? []) {
        console.log(`Message "${m.name}" on ${event.channel} from ${m.clientId ?? 'unknown'}`);
      }
      if (event.data !== undefined) console.log(`Message "${event.name}" on ${event.channel}`);
      break;
    case 'channel.presence':
      for (const p of event.presence ?? []) {
        console.log(`Presence ${PRESENCE_ACTIONS[p.action as number] ?? p.action}: ${p.clientId} on ${event.channel}`);
      }
      if (event.data !== undefined) console.log(`Presence ${event.name} on ${event.channel}`);
      break;
    case 'channel.lifecycle':
      // name is channel.opened or channel.closed
      console.log(`Channel lifecycle ${event.name} on ${event.channel}`);
      break;
    case 'channel.occupancy':
      console.log(`Occupancy changed on ${event.channel}`);
      break;
    default:
      console.log(`Unhandled Ably source: ${event.source}`);
  }
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ABLY_API_KEY;
  if (!apiKey || !keyValueOf(apiKey)) {
    return NextResponse.json(
      { error: 'ABLY_API_KEY must be a full Ably API key (appId.keyId:keyValue)' },
      { status: 500 }
    );
  }

  // Raw bytes are required: the signature covers the exact body Ably sent, in any encoding
  const rawBody = Buffer.from(await request.arrayBuffer());

  // Signing is opt-in on the rule ("Sign with key"); this handler requires it
  const signature = request.headers.get('x-ably-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Ably-Signature header' }, { status: 400 });
  }
  if (!keyMatches(request.headers.get('x-ably-key'), apiKey)) {
    return NextResponse.json({ error: 'Signed with a different API key' }, { status: 400 });
  }
  if (!verifyAblySignature(rawBody, signature, apiKey)) {
    console.error('Ably webhook verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let events: AblyEvent[];
  try {
    events = extractEvents(request.headers, rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  for (const event of events) handleEvent(event);
  return NextResponse.json({ received: true });
}
