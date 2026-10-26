// Generated with: doubleword-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// A whsec_ secret is base64-decoded after the prefix (the library does this).
// Any other secret is used as its raw UTF-8 bytes, matching Hookdeck.
function createWebhook(secret: string): Webhook {
  if (secret.startsWith('whsec_')) return new Webhook(secret);
  return new Webhook(new TextEncoder().encode(secret), { format: 'raw' });
}

export async function POST(request: NextRequest) {
  const secret = process.env.DOUBLEWORD_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed: never accept unverified deliveries.
    console.error('DOUBLEWORD_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the RAW body: the signature covers the exact bytes.
  const body = await request.text();

  // Doubleword sends webhook-* headers; fall back to svix-* when webhook-id is
  // absent, then hand the library the names it reads.
  const prefix = request.headers.get('webhook-id') ? 'webhook' : 'svix';
  const headers = {
    'webhook-id': request.headers.get(`${prefix}-id`) ?? '',
    'webhook-timestamp': request.headers.get(`${prefix}-timestamp`) ?? '',
    'webhook-signature': request.headers.get(`${prefix}-signature`) ?? '',
  };
  if (!headers['webhook-id'] || !headers['webhook-timestamp'] || !headers['webhook-signature']) {
    return NextResponse.json({ error: 'Missing webhook signature headers' }, { status: 400 });
  }

  try {
    // verify() also enforces a fixed 5-minute timestamp window.
    createWebhook(secret).verify(body, headers, { jsonParse: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Webhook signature verification failed:', message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after the signature check.
  let event: { type?: string; data?: Record<string, any> };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const data = event.data ?? {};
  switch (event.type) {
    case 'batch.completed':
      console.log(`Batch ${data.batch_id} completed:`, data.request_counts);
      // TODO: download results with the files API using data.output_file_id
      break;

    case 'batch.failed':
      console.log(`Batch ${data.batch_id} failed:`, data.request_counts);
      // TODO: alert, then inspect data.error_file_id
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  // Any 2xx acknowledges. Repeated non-2xx responses disable the webhook.
  return NextResponse.json({ received: true });
}
