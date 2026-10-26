// Generated with: formbricks-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

export const dynamic = 'force-dynamic';

// Formbricks sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent
function readSignatureHeaders(headers: Headers) {
  const prefix = headers.get('webhook-id') ? 'webhook' : 'svix';
  return {
    'webhook-id': headers.get(`${prefix}-id`),
    'webhook-timestamp': headers.get(`${prefix}-timestamp`),
    'webhook-signature': headers.get(`${prefix}-signature`),
  };
}

export async function POST(request: Request) {
  const secret = process.env.FORMBRICKS_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('FORMBRICKS_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature } =
    readSignatureHeaders(request.headers);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Formbricks signed
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
    console.error('Formbricks webhook verification failed:', message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: { event?: string; data?: Record<string, any>; webhookId?: string };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof event !== 'object' || event === null) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The body is { event, data, webhookId }: `event` names the trigger, `data` is the response
  // (answers are in data.data, a summary of the survey in data.survey)
  const eventType = event.event;
  const data = event.data ?? {};
  // webhook-id is stable across retries and the body has no event id: use it to deduplicate
  console.log(`Received Formbricks webhook ${id}: ${eventType}`);

  switch (eventType) {
    case 'responseCreated':
      console.log('Response created:', data.id, 'survey', data.surveyId);
      break;
    case 'responseUpdated':
      console.log('Response updated:', data.id, 'survey', data.surveyId);
      break;
    case 'responseFinished':
      console.log('Response finished:', data.id, 'survey', data.surveyId);
      break;
    default:
      // The documented list may not be exhaustive: ignore what you don't need
      console.log('Unhandled event type:', eventType);
  }

  return NextResponse.json({ received: true, event: eventType ?? null });
}
