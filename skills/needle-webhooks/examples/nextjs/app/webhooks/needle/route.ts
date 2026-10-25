// Generated with: needle-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Needle signs webhooks with Standard Webhooks headers:
//   webhook-id         the event id (same value when a request is sent again)
//   webhook-timestamp  Unix seconds when this request was sent
//   webhook-signature  "v1,<base64 signature>" (one or more, space-separated)
// Signed content is `${webhook-id}.${webhook-timestamp}.${rawBody}`, HMAC-SHA256,
// keyed with the base64-decoded part of the `whsec_` secret after the prefix.
// ---------------------------------------------------------------------------

interface NeedleEvent {
  version: string; // "v1"
  id: string; // event id, same as the webhook-id header
  type: string; // e.g. "lead_created"
  timestamp: string; // when the event happened
  data: Record<string, any>; // the event object; data.data depends on the type
}

type NeedleHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

/**
 * Verify a Needle delivery with the Standard Webhooks library. It rejects
 * timestamps more than 5 minutes off (fixed), recomputes the HMAC over the raw
 * body, and compares in constant time against every `v1,` entry. Throws if
 * verification fails.
 *
 * Hookdeck retries/replays resend the ORIGINAL timestamp, so a late one fails
 * here (Needle's own retries carry a fresh timestamp). See references/verification.md for a manual verifier
 * where the window can be dropped or widened.
 */
function verifyNeedleWebhook(rawBody: string, headers: NeedleHeaders, secret: string): NeedleEvent {
  return new Webhook(secret).verify(rawBody, headers) as NeedleEvent;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// A resend keeps the same webhook-id.
const processedMessageIds = new Set<string>();

function handleEvent(body: NeedleEvent): void {
  const { type, id, data } = body;

  switch (type) {
    case 'lead_created':
      console.log(`Lead created: ${data.leadName || data.leadId} (${data.leadEmail || 'no email'}, event ${id})`);
      break;

    case 'lead_updated':
      // data.data.changes lists each changed field
      console.log(`Lead updated: ${data.leadId} (event ${id})`);
      break;

    case 'linkedin_message_received':
      // A reply: route it to a human and stop automated follow-ups
      console.log(`LinkedIn reply from ${data.leadName || data.leadId}: ${data.data?.text} (event ${id})`);
      break;

    case 'enrollment_completed':
      console.log(`Enrollment ${data.enrollmentId} completed in campaign ${data.campaignId} (event ${id})`);
      break;

    case 'campaign_status_changed':
      console.log(`Campaign ${data.campaignId} status changed: ${data.data?.message} (event ${id})`);
      break;

    case 'account_disconnected':
      // The account needs signing in again; its campaigns wait until it does
      console.log(`Account ${data.connectedAccountId} disconnected: ${data.data?.errorKind} (event ${id})`);
      break;

    default:
      // Needle adds event types over time: ignore ones you don't know
      console.log(`Unhandled Needle event type: ${type}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  const secret = process.env.NEEDLE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('NEEDLE_WEBHOOK_SECRET is not set, rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const webhookId = request.headers.get('webhook-id');
  const webhookTimestamp = request.headers.get('webhook-timestamp');
  const webhookSignature = request.headers.get('webhook-signature');
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return NextResponse.json({ error: 'Missing webhook signature headers' }, { status: 400 });
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let body: NeedleEvent;
  try {
    body = verifyNeedleWebhook(
      rawBody,
      {
        'webhook-id': webhookId,
        'webhook-timestamp': webhookTimestamp,
        'webhook-signature': webhookSignature,
      },
      secret
    );
  } catch (err) {
    console.error('Needle webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // A resend keeps the webhook-id, so acknowledge duplicates with 200.
  if (processedMessageIds.has(webhookId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Answer within 10 seconds. In production, enqueue here and process asynchronously.
    handleEvent(body);
    processedMessageIds.add(webhookId);
  } catch (err) {
    console.error('Error handling Needle event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
