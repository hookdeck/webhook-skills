// Generated with: nomod-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.NOMOD_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('NOMOD_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
  const prefix = request.headers.get('svix-id') ? 'svix' : 'webhook';
  const id = request.headers.get(`${prefix}-id`);
  const timestamp = request.headers.get(`${prefix}-timestamp`);
  const signature = request.headers.get(`${prefix}-signature`);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Nomod (Svix) signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    // The library accepts either header-name set, so hand it the resolved values under both.
    new Webhook(secret).verify(rawBody, {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Nomod webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Body: { type, eventId, objectId, data }. `type` is the event name, `objectId` the charge
  // (ch_...) and `data` the full charge. Do not confuse it with data.events[].type, which is
  // the charge's own history ("completed").
  const { type, eventId, objectId } = event as { type: string; eventId: string; objectId: string };
  const charge: Record<string, any> = event.data ?? {};
  // `eventId` is stable across redeliveries: use it to ignore repeated deliveries.
  console.log(`Received Nomod webhook ${eventId}: ${type} (${objectId} -> ${charge.status})`);

  switch (type) {
    case 'charge.created':
      // A payment object exists and is awaiting customer action
      console.log('Charge created:', objectId, charge.total, charge.currency);
      break;
    case 'charge.authorised':
      // Funds are reserved on the customer's card, awaiting capture
      console.log('Charge authorised:', objectId, charge.total, charge.currency);
      break;
    case 'charge.completed':
      // Funds captured and settled: fulfil the order
      console.log('Charge completed:', objectId, charge.total, charge.currency, charge.referenceId);
      break;
    case 'charge.failed':
      // Declined at authorisation or capture
      console.log('Charge failed:', objectId, charge.error);
      break;
    case 'charge.cancelled':
      // The authorisation was voided before capture
      console.log('Charge cancelled:', objectId);
      break;
    case 'charge.refunded':
      console.log('Charge refunded:', objectId, charge.refundTotal, charge.currency);
      break;
    case 'charge.partially_refunded':
      // The remaining amount stays settled
      console.log('Charge partially refunded:', objectId, charge.refundTotal, charge.currency);
      break;
    case 'charge.dispute.created':
      // A chargeback or dispute was opened by the customer
      console.log('Dispute created:', objectId);
      break;
    default:
      // Return 200 for events you don't handle, or Nomod keeps retrying them
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ success: true, type });
}
