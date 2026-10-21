// Generated with: sendoso-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

// ---------------------------------------------------------------------------
// Sendoso delivers webhooks through Svix:
//   svix-id         unique message id (stable across retries -> dedupe key)
//   svix-timestamp  Unix seconds of the delivery attempt
//   svix-signature  "v1,<base64 HMAC-SHA256>" (space-separated list)
// Signed content: `${svix-id}.${svix-timestamp}.${rawBody}`
// Key: base64-decode of the endpoint secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

/**
 * The one payload Sendoso documents for every event type (send.shipped,
 * send.delivered, send.redeemed, ...). The event type itself isn't in the
 * documented body: subscribe this endpoint only to the events it should act
 * on, or look the send up by send_gid (Retrieve All Sends) for its status.
 */
export interface SendosoStatusChange {
  send_gid: string;
  status_changed_at: string; // ISO 8601
}

type SvixHeaders = Record<'svix-id' | 'svix-timestamp' | 'svix-signature', string>;

/**
 * Verify with the official Svix SDK: ±5 minute timestamp window, every `v1,`
 * entry, constant-time compare. svix 2.x `verify()` returns nothing (it only
 * throws), so parse the body after it succeeds.
 */
function verifySendosoWebhook(rawBody: string, headers: SvixHeaders, secret: string): unknown {
  new Webhook(secret).verify(rawBody, headers);
  return JSON.parse(rawBody);
}

function isStatusChange(payload: unknown): payload is SendosoStatusChange {
  const p = payload as Partial<SendosoStatusChange> | null;
  return typeof p?.send_gid === 'string' && typeof p?.status_changed_at === 'string';
}

// In-memory state for the demo. Use Redis or your database in production.
const processedMessageIds = new Set<string>(); // svix-id values already handled
const lastStatusChangeBySend = new Map<string, string>(); // send_gid -> status_changed_at

function handleSendStatusChange({ send_gid, status_changed_at }: SendosoStatusChange) {
  const previous = lastStatusChangeBySend.get(send_gid);
  if (previous && Date.parse(previous) >= Date.parse(status_changed_at)) {
    // Retries and replays can arrive out of order; ignore stale updates.
    console.log(`Ignoring stale update for send ${send_gid} (${status_changed_at})`);
    return { stale: true };
  }
  lastStatusChangeBySend.set(send_gid, status_changed_at);

  // e.g. enqueue a job that fetches the send and updates your CRM.
  console.log(`Sendoso send ${send_gid} changed status at ${status_changed_at}`);
  return { stale: false };
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  const secret = process.env.SENDOSO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SENDOSO_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: 'Missing svix-id, svix-timestamp or svix-signature header' },
      { status: 400 }
    );
  }

  // Raw body: request.json() before verification would break the signature.
  const rawBody = await request.text();

  let payload: unknown;
  try {
    payload = verifySendosoWebhook(
      rawBody,
      { 'svix-id': svixId, 'svix-timestamp': svixTimestamp, 'svix-signature': svixSignature },
      secret
    );
  } catch (err) {
    console.error('Sendoso webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (!isStatusChange(payload)) {
    return NextResponse.json(
      { error: 'Payload missing send_gid or status_changed_at' },
      { status: 400 }
    );
  }

  // At-least-once delivery: acknowledge duplicates without reprocessing.
  if (processedMessageIds.has(svixId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Sendoso times out after 15 seconds; in production enqueue and return.
    const result = handleSendStatusChange(payload);
    processedMessageIds.add(svixId);
    return NextResponse.json({ received: true, ...(result.stale && { stale: true }) });
  } catch (err) {
    console.error('Error handling Sendoso webhook:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
