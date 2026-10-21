// Generated with: ada-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Ada (ada.cx) delivers webhooks through Svix:
//   svix-id         unique message ID (stable across retries)
//   svix-timestamp  Unix seconds when the attempt was sent
//   svix-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${svix-id}.${svix-timestamp}.${rawBody}`
// Key: base64-decode of the endpoint's secret after its `whsec_` prefix.
// Each Ada webhook endpoint has its own signing secret.
// ---------------------------------------------------------------------------

interface AdaEvent {
  type: string; // e.g. "v1.conversation.created"
  timestamp: string; // millisecond precision, for ordering
  data: Record<string, any>;
  tags?: string[]; // end_user and audit_log events only
}

type SvixHeaders = Record<'svix-id' | 'svix-timestamp' | 'svix-signature', string>;

/**
 * Verify an Ada delivery with the Standard Webhooks library (maintained by
 * Svix; same algorithm as the `svix` SDK). It checks the timestamp (5-minute
 * tolerance), recomputes the HMAC over the raw body, and compares in constant
 * time against every `v1,` entry. It expects webhook-* header names, so the
 * svix-* headers Ada sends are mapped across.
 */
function verifyAdaWebhook(
  rawBody: string,
  headers: SvixHeaders,
  secret = process.env.ADA_WEBHOOK_SECRET as string
): AdaEvent {
  return new Webhook(secret).verify(rawBody, {
    'webhook-id': headers['svix-id'],
    'webhook-timestamp': headers['svix-timestamp'],
    'webhook-signature': headers['svix-signature'],
  }) as AdaEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Ada payloads carry no top-level event ID, so dedupe on the svix-id header.
const processedMessageIds = new Set<string>();

function handleEvent(event: AdaEvent): void {
  const { type, data = {} } = event;

  switch (type) {
    // --- Conversations -----------------------------------------------------
    case 'v1.conversation.created':
      console.log(`Conversation created: ${data.conversation_id} (end user ${data.end_user_id})`);
      break;
    case 'v1.conversation.message':
      // author.role is end_user, ai_agent or human_agent; content.type is
      // text, link, file or quick_replies.
      console.log(
        `Message ${data.message_id} in ${data.conversation_id} from ${data.author?.role}: ${data.content?.type}`
      );
      break;
    case 'v1.conversation.ended':
      console.log(`Conversation ended: ${data.conversation_id} (by ${data.ended_by?.role})`);
      break;
    case 'v1.conversation.handoff.ended':
      console.log(`Handoff to ${data.handoff_integration} ended in ${data.conversation_id}`);
      break;

    // --- End users ---------------------------------------------------------
    case 'v1.end_user.created':
    case 'v1.end_user.updated':
      console.log(`${type}: ${data.end_user_id}`);
      break;

    // --- Audit log (best effort; reconcile with the Audit log pull API) ----
    case 'v1.audit_log.emitted':
      console.log(`Audit log: ${data.entity_type} ${data.entity_id} ${data.activity}`);
      break;

    // --- Voice Proactive Outreach (can arrive out of order) ----------------
    case 'v1.proactive_call.queued':
    case 'v1.proactive_call.initiated':
    case 'v1.proactive_call.answered':
    case 'v1.proactive_call.machine_detected':
      console.log(`Proactive call ${data.proactive_attempt_id} -> ${data.state}`);
      break;
    case 'v1.proactive_call.failed':
      console.log(`Proactive call ${data.proactive_attempt_id} failed: ${data.failure_reason}`);
      break;

    default:
      console.log(`Unhandled Ada event type: ${type}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.ADA_WEBHOOK_SECRET) {
    console.error('ADA_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing Svix signature headers' }, { status: 400 });
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let event: AdaEvent;
  try {
    event = verifyAdaWebhook(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    console.error('Ada webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Retries reuse the same svix-id; acknowledge duplicates with 200.
  if (processedMessageIds.has(svixId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Ada needs a 2xx within 15 seconds. In production, enqueue the event
    // here and process it asynchronously.
    handleEvent(event);
    processedMessageIds.add(svixId);
  } catch (err) {
    console.error('Error handling Ada event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
