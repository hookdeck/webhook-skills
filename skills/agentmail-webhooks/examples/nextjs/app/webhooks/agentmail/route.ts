// Generated with: agentmail-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

// ---------------------------------------------------------------------------
// AgentMail delivers webhooks through Svix:
//   svix-id         message ID (differs per org/pod/inbox webhook)
//   svix-timestamp  Unix seconds when the message was sent
//   svix-signature  "v1,<base64 HMAC-SHA256>" (space-delimited list)
// Signed content: `${svix-id}.${svix-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

export interface AgentMailEvent {
  type: 'event';
  event_type: string; // e.g. "message.received"
  event_id: string; // same across retries and across webhooks; opaque format
  [key: string]: any; // event-specific objects: message, thread, send, bounce, domain, ...
}

type SvixHeaders = Record<'svix-id' | 'svix-timestamp' | 'svix-signature', string>;

/**
 * Verify an AgentMail delivery with the official Svix library. Svix checks the
 * timestamp (5-minute tolerance), recomputes the HMAC over the raw body, and
 * compares in constant time against every `v1,` entry.
 *
 * svix 2.x `verify()` returns nothing (it throws on failure), so the JSON is
 * parsed here after verification succeeds.
 */
function verifyAgentMailWebhook(rawBody: string, headers: SvixHeaders, secret: string): AgentMailEvent {
  new Webhook(secret).verify(rawBody, headers);
  return JSON.parse(rawBody) as AgentMailEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Dedupe on event_id, NOT svix-id: event_id is the same across retries and
// across every webhook (org, pod, inbox) that receives the event.
const processedEventIds = new Set<string>();

function handleEvent(event: AgentMailEvent): void {
  const eventType = event.event_type;

  switch (eventType) {
    // --- Inbound mail ------------------------------------------------------
    case 'message.received': {
      // The only events that carry message content (plus thread metadata).
      // `text` may be missing for HTML-only emails; prefer `html`.
      const { message, thread } = event;
      console.log(
        `Email received in ${message.inbox_id} from ${message.from}: "${message.subject}" ` +
          `(thread ${thread.thread_id}, ${thread.message_count} messages)`
      );
      break;
    }
    case 'message.received.spam':
    case 'message.received.blocked':
    case 'message.received.unauthenticated':
      // Opt-in only; same shape as message.received.
      console.log(`${eventType}: ${event.message.message_id} from ${event.message.from}`);
      break;

    // --- Outbound mail -----------------------------------------------------
    case 'message.sent':
      console.log(`Message sent: ${event.send.message_id} to ${event.send.recipients.join(', ')}`);
      break;
    case 'message.delivered':
      console.log(`Message delivered: ${event.delivery.message_id}`);
      break;
    case 'message.bounced': {
      const { bounce } = event;
      const addresses = bounce.recipients.map((r: { address: string }) => r.address).join(', ');
      console.log(`Message bounced (${bounce.type}/${bounce.sub_type}): ${bounce.message_id} → ${addresses}`);
      break;
    }
    case 'message.complained':
      console.log(`Spam complaint on ${event.complaint.message_id}: ${event.complaint.recipients.join(', ')}`);
      break;
    case 'message.rejected':
      console.log(`Message rejected: ${event.reject.message_id} (${event.reject.reason})`);
      break;
    case 'message.opened':
      console.log(`Message opened: ${event.open.message_id} at ${event.open.timestamp}`);
      break;

    // --- Agent Armor ---------------------------------------------------------
    case 'message.security.completed':
      console.log(`Agent Armor verdict for ${event.message.message_id}: ${event.message.agent_armor.verdict}`);
      break;
    case 'message.security.review':
      console.log(`Agent Armor held ${event.message.message_id} for review`);
      break;
    case 'message.security.override':
      console.log(`Held message released: ${event.message.message_id} (${event.message.manual_override.reason})`);
      break;

    // --- Domains -------------------------------------------------------------
    case 'domain.verified':
      console.log(`Domain verified: ${event.domain.domain_id} (${event.domain.status})`);
      break;

    // --- Calendar --------------------------------------------------------------
    case 'calendar.event.created':
    case 'calendar.event.updated':
    case 'calendar.event.deleted':
    case 'calendar.event.responded':
    case 'calendar.event.starting':
    case 'calendar.event.ending':
      console.log(`${eventType}: ${event.calendar_event?.title ?? event.calendar_event?.event_id}`);
      break;

    default:
      console.log(`Unhandled AgentMail event type: ${eventType}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  const secret = process.env.AGENTMAIL_WEBHOOK_SECRET;
  if (!secret) {
    console.error('AGENTMAIL_WEBHOOK_SECRET is not set — rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing Svix signature headers' }, { status: 400 });
  }

  // Raw body: the signature covers the exact bytes, so never verify request.json().
  const rawBody = await request.text();

  let event: AgentMailEvent;
  try {
    event = verifyAgentMailWebhook(
      rawBody,
      { 'svix-id': svixId, 'svix-timestamp': svixTimestamp, 'svix-signature': svixSignature },
      secret
    );
  } catch (err) {
    console.error('AgentMail webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Duplicates are normal (at-least-once delivery) — acknowledge with 200.
  if (processedEventIds.has(event.event_id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Keep this fast: AgentMail needs a 2xx within 15 seconds. In production,
    // enqueue the event here and process it asynchronously.
    handleEvent(event);
    processedEventIds.add(event.event_id);
  } catch (err) {
    console.error('Error handling AgentMail event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
