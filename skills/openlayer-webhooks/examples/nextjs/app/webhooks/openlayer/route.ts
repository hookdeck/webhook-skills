// Generated with: openlayer-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

export const dynamic = 'force-dynamic';

// Openlayer sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent
function readSignatureHeaders(headers: Headers) {
  const prefix = headers.get('webhook-id') ? 'webhook' : 'svix';
  return {
    'webhook-id': headers.get(`${prefix}-id`),
    'webhook-timestamp': headers.get(`${prefix}-timestamp`),
    'webhook-signature': headers.get(`${prefix}-signature`),
  };
}

export async function POST(request: Request) {
  const secret = process.env.OPENLAYER_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('OPENLAYER_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature } =
    readSignatureHeaders(request.headers);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Openlayer signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    new Webhook(secret).verify(
      rawBody,
      { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature },
      { jsonParse: false },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Openlayer webhook verification failed:', message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: { type?: string; timestamp?: string; data?: Record<string, any> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof event !== 'object' || event === null) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Every body is { type, timestamp, data }: the event name is the dotted top-level `type`
  // (data.test.type is the test's own category, not the event type)
  const type = event.type;
  const data = event.data && typeof event.data === 'object' ? event.data : {};
  // webhook-id is stable across retries: use it to deduplicate. Order events by event.timestamp.
  console.log(`Received Openlayer webhook ${id}: ${type}`);

  switch (type) {
    case 'test.created':
      console.log('Test created:', data.test?.id, data.test?.name, data.test?.type);
      break;
    case 'test.updated':
      console.log('Test updated:', data.test?.id, data.test?.name);
      break;
    case 'test.deleted':
      // Only the test id is sent after deletion
      console.log('Test deleted:', data.test?.id);
      break;
    case 'tests.result.updated': {
      // One event per suite run; alert when anything failed
      const run = data.tests ?? {};
      console.log(`Test run finished: ${run.passing}/${run.total} passing, ${run.failing} failing, ${run.skipped} skipped, ${run.running} running`);
      if (run.failing > 0) console.log('ALERT: failing tests in project', run.projectId);
      break;
    }
    default:
      // The documented list may grow: ignore what you don't need
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ received: true, type: type ?? null });
}
