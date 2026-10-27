// Generated with: cuuro-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

// Cuuro sends svix-* headers; Hookdeck also accepts the Standard Webhooks webhook-* names
function readSignatureHeaders(headers: Headers) {
  const prefix = headers.get('svix-id') ? 'svix' : 'webhook';
  return {
    id: headers.get(`${prefix}-id`),
    timestamp: headers.get(`${prefix}-timestamp`),
    signature: headers.get(`${prefix}-signature`),
  };
}

export async function POST(request: Request) {
  const secret = process.env.CUURO_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('CUURO_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { id, timestamp, signature } = readSignatureHeaders(request.headers);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Cuuro (Svix) signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
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
    console.error('Cuuro webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The event type is the top-level `event` field, beside `data`: { data: { id }, event }
  const type: string | undefined = payload.event;
  const resourceId = payload.data?.id;
  // The svix-id is stable across retries: use it to deduplicate
  console.log(`Received Cuuro webhook ${id}: ${type}`);

  switch (type) {
    case 'startup.created':
      // data.id is the id of the new target company
      console.log('Target company created:', resourceId);
      break;
    case 'analysis.created':
      // data.id is the analysis id
      console.log('Analysis created:', resourceId);
      break;
    case 'analysis.completed':
      // data.id is the analysis id; fetch the results from the Cuuro API
      console.log('Analysis completed:', resourceId);
      break;
    default:
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ success: true, type: type ?? null });
}
