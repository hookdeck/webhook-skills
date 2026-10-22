// Generated with: cloudtalk-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

// ---------------------------------------------------------------------------
// CloudTalk account-level webhooks (Settings > Webhooks) use the Svix scheme:
//   svix-id         delivery id (same on every retry of the event)
//   svix-timestamp  Unix seconds when the request was sent
//   svix-signature  "v1,<base64 HMAC-SHA256>" (space-delimited list)
// Signed content: `${svix-id}.${svix-timestamp}.${rawBody}`
// Key: base64-decode of the secret after its `whsec_` prefix.
//
// NOT signed this way: the Call Flow Designer Webhook step, an AI Voice
// Agent's "Send via Webhook" option, and Workflow Automation actions.
// ---------------------------------------------------------------------------

interface CloudTalkEvent {
  event_id: string; // stable across retries; de-duplicate on it
  type: string; // "resource.action", e.g. "call.ended"
  version: string;
  occurred_at: string; // RFC 3339 UTC; delivery order is not guaranteed
  company_id: string;
  data: Record<string, any>;
}

type SvixHeaders = Record<'svix-id' | 'svix-timestamp' | 'svix-signature', string>;

/**
 * Verify a CloudTalk delivery with the Svix library. Svix checks the timestamp
 * (5-minute tolerance), recomputes the HMAC over the raw body, and compares in
 * constant time against every `v1,` entry.
 *
 * svix 2.x `verify()` returns nothing (it throws on failure), so the JSON is
 * parsed here after verification succeeds.
 */
function verifyCloudTalkWebhook(rawBody: string, headers: SvixHeaders, secret: string): CloudTalkEvent {
  new Webhook(secret).verify(rawBody, headers);
  return JSON.parse(rawBody) as CloudTalkEvent;
}

// In-memory dedupe for the demo. Use a store with a unique constraint (Redis
// SET NX, unique index) in production and keep ids for 30 days, because
// Resend and Recover can replay anything within CloudTalk's retention window.
const processedEventIds = new Set<string>();

function handleEvent(event: CloudTalkEvent): void {
  const { type } = event;
  const data = event.data ?? {};

  switch (type) {
    // --- Calls ---------------------------------------------------------------
    case 'call.started':
      console.log(`Call started ${data.call_uuid} (${data.direction}) with ${data.external_number}`);
      break;
    case 'call.ringing':
      console.log(`Call ringing ${data.call_uuid}`);
      break;
    case 'call.answered':
      console.log(`Call answered ${data.call_uuid}`);
      break;
    case 'call.held':
    case 'call.resumed':
      // Events can arrive out of order: pair on call_uuid and sort by occurred_at.
      console.log(`${type} ${data.call_uuid} by ${data.user?.name}`);
      break;
    case 'call.ended':
      console.log(
        `Call ended ${data.call_uuid}: ${data.duration}s total, ${data.talking_time}s talking, recorded=${data.recorded}`
      );
      break;
    case 'call.recording_ready':
      // Async, can arrive minutes after call.ended.
      console.log(`Recording ready for call ${data.call_uuid}`);
      break;
    case 'call.tags_modified':
      console.log(`Tags modified on call ${data.call_uuid}`);
      break;

    // --- Contacts --------------------------------------------------------------
    case 'contact.created':
    case 'contact.updated':
      console.log(`${type}: ${data.name} (${data.id})`);
      break;
    case 'contact.deleted':
      // Id only.
      console.log(`Contact deleted: ${data.id}`);
      break;

    // --- Users -----------------------------------------------------------------
    case 'user.created':
    case 'user.updated':
      console.log(`${type}: ${data.name ?? data.id}`);
      break;
    case 'user.deleted':
      console.log(`User deleted: ${data.id}`);
      break;
    case 'user.status_changed':
      console.log(`User ${data.user_id} is now ${data.status} (${data.sub_status})`);
      break;

    // --- Messages (SMS, MMS, WhatsApp) -----------------------------------------
    case 'message.sent':
    case 'message.received':
      console.log(`${type} (${data.channel}) with ${data.external_number}: ${data.body}`);
      break;

    // --- Conversation Intelligence ---------------------------------------------
    case 'transcript.ready':
      console.log(`Transcript ready for call ${data.call_uuid ?? data.call_id}`);
      break;
    case 'cidata.ready':
      console.log(`AI analysis ready for call ${data.call_uuid ?? data.call_id}`);
      break;

    // --- AI Voice Agents and Dialer ----------------------------------------------
    case 'voice_agent.extracted_data_ready':
      console.log('Voice agent extracted data ready');
      break;
    case 'dialer.disposition_created':
      console.log('Dialer disposition recorded');
      break;
    case 'dialer.survey_filled':
      console.log('Dialer survey filled');
      break;

    default:
      // New event types are added over time: acknowledge and ignore.
      console.log(`Unhandled CloudTalk event type: ${type}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  const secret = process.env.CLOUDTALK_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CLOUDTALK_WEBHOOK_SECRET is not set — rejecting delivery');
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

  let event: CloudTalkEvent;
  try {
    event = verifyCloudTalkWebhook(
      rawBody,
      { 'svix-id': svixId, 'svix-timestamp': svixTimestamp, 'svix-signature': svixSignature },
      secret
    );
  } catch (err) {
    console.error('CloudTalk webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Delivery is at-least-once: duplicates carry the same event_id.
  if (processedEventIds.has(event.event_id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // CloudTalk needs a 2xx within 15 seconds. In production, enqueue the
    // event here and process it asynchronously.
    processedEventIds.add(event.event_id); // claim before doing the work
    handleEvent(event);
  } catch (err) {
    processedEventIds.delete(event.event_id); // release so a retry can process it
    console.error('Error handling CloudTalk event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
