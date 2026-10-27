// Generated with: tolt-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.TOLT_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('TOLT_WEBHOOK_SECRET is missing or not a whsec_ secret');
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

  // Read the RAW body: verification needs the exact bytes Tolt (Svix) signed
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
    console.error('Tolt webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Every delivery is { type, data, timestamp }. `data` is the API resource plus
  // organization_id; money fields are strings in cents ("980"), so parse before doing math
  const type: string = event.type;
  const data = event.data;
  // The body has no event id: the svix-id header is stable across retries, so deduplicate on it.
  // Order is not guaranteed either: keep the newest version by data.updated_at
  console.log(`Received Tolt webhook ${id}: ${type}`);

  switch (type) {
    case 'partner.created':
      console.log('Partner joined:', data?.id);
      break;
    case 'partner.updated':
      // Also fires when a partner is approved, rejected or suspended
      console.log('Partner updated:', data?.id, data?.status);
      break;
    case 'link.created':
      console.log('Referral link created:', data?.id);
      break;
    case 'link.updated':
      console.log('Referral link updated:', data?.id);
      break;
    case 'customer.created':
      console.log('Referred customer signed up:', data?.id, data?.partner_id);
      break;
    case 'customer.updated':
      console.log('Customer updated:', data?.id, data?.status);
      break;
    case 'transaction.created':
      console.log('Transaction recorded:', data?.id, data?.amount, data?.currency);
      break;
    case 'transaction.updated':
      // Edited or refunded: read the status from the payload
      console.log('Transaction updated:', data?.id, data?.status);
      break;
    case 'commission.created':
      console.log('Commission earned:', data?.id, data?.partner_id, data?.amount, data?.currency);
      break;
    case 'commission.updated':
      // Approved, declined or edited
      console.log('Commission updated:', data?.id, data?.status);
      break;
    default:
      // Return 200 for events you don't handle, or Tolt keeps retrying them
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ success: true, type });
}
