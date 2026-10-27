// Generated with: memos-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

export const dynamic = 'force-dynamic';

// Memos sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent
function readSignatureHeaders(headers: Headers) {
  const prefix = headers.get('webhook-id') ? 'webhook' : 'svix';
  return {
    'webhook-id': headers.get(`${prefix}-id`),
    'webhook-timestamp': headers.get(`${prefix}-timestamp`),
    'webhook-signature': headers.get(`${prefix}-signature`),
  };
}

// A whsec_ secret is base64-decoded after the prefix; any other value is used as its raw bytes (as Memos does)
function createVerifier(secret: string) {
  return secret.startsWith('whsec_')
    ? new Webhook(secret)
    : new Webhook(Buffer.from(secret, 'utf8'), { format: 'raw' });
}

// Memos treats any response without JSON {"code":0} as a failed delivery, so every accepted delivery gets it
const ACK = { code: 0 };

export async function POST(request: Request) {
  const secret = process.env.MEMOS_WEBHOOK_SECRET;
  if (!secret) {
    console.error('MEMOS_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature } =
    readSignatureHeaders(request.headers);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Memos signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    createVerifier(secret).verify(
      rawBody,
      { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature },
      { jsonParse: false },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Memos webhook verification failed:', message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: { activityType?: string; creator?: string };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof event !== 'object' || event === null) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The body is { url, activityType, creator, memo }; the event name is the top-level activityType
  const { activityType, creator } = event;
  // webhook-id is stable across retries and the body has no event id: use it to deduplicate
  console.log(`Received Memos webhook ${id}: ${activityType}`);

  switch (activityType) {
    case 'memos.memo.created':
      console.log('Memo created by:', creator);
      break;
    case 'memos.memo.updated':
      console.log('Memo updated by:', creator);
      break;
    case 'memos.memo.deleted':
      console.log('Memo deleted by:', creator);
      break;
    case 'memos.memo.comment.created':
      console.log('Memo comment created by:', creator);
      break;
    default:
      // The documented list may grow: acknowledge what you don't handle so Memos doesn't count a failure
      console.log('Unhandled activity type:', activityType);
  }

  return NextResponse.json(ACK);
}
