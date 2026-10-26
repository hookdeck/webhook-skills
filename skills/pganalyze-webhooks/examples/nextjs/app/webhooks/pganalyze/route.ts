// Generated with: pganalyze-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

export const dynamic = 'force-dynamic';

// pganalyze sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent
function readSignatureHeaders(headers: Headers) {
  const prefix = headers.get('webhook-id') ? 'webhook' : 'svix';
  return {
    'webhook-id': headers.get(`${prefix}-id`),
    'webhook-timestamp': headers.get(`${prefix}-timestamp`),
    'webhook-signature': headers.get(`${prefix}-signature`),
  };
}

export async function POST(request: Request) {
  const secret = process.env.PGANALYZE_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('PGANALYZE_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature } =
    readSignatureHeaders(request.headers);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes pganalyze signed
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
    console.error('pganalyze webhook verification failed:', message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: { type?: string; data?: Record<string, any> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof event !== 'object' || event === null) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Every body is { type, id, timestamp, version, organization, data }: the event name is the top-level `type`
  const type = event.type;
  const data = event.data && typeof event.data === 'object' ? event.data : {};
  const issue = data.issue && typeof data.issue === 'object' ? data.issue : {};
  // webhook-id (also the body `id`) is stable across retries: use it to deduplicate
  console.log(`Received pganalyze webhook ${id}: ${type}`);

  switch (type) {
    case 'issue.triggered':
      console.log('Issue triggered:', issue.id, issue.severity, issue.checkKind, '-', issue.description);
      break;
    case 'issue.escalated':
      console.log('Issue escalated:', issue.id, issue.severity, issue.checkKind, 'on', data.server?.name);
      break;
    case 'issue.downgraded':
      console.log('Issue downgraded:', issue.id, issue.severity, issue.checkKind, 'on', data.server?.name);
      break;
    case 'issue.acknowledged':
      console.log('Issue acknowledged:', issue.id, issue.checkKind);
      break;
    case 'issue.reopened':
      console.log('Issue reopened:', issue.id, issue.checkKind);
      break;
    case 'issue.resolved':
      console.log('Issue resolved:', issue.id, issue.checkKind);
      break;
    case 'ping':
      // Sent by "Test and Add" and "Send test": a test event, nothing to answer
      console.log('Ping received for endpoint:', data.endpoint?.name);
      break;
    default:
      // The documented list may not be exhaustive: ignore what you don't need
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ received: true, type: type ?? null });
}
