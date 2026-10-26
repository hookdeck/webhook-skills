// Generated with: liveblocks-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

export const dynamic = 'force-dynamic';

// Liveblocks sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent
function readSignatureHeaders(headers: Headers) {
  const prefix = headers.get('webhook-id') ? 'webhook' : 'svix';
  return {
    'webhook-id': headers.get(`${prefix}-id`),
    'webhook-timestamp': headers.get(`${prefix}-timestamp`),
    'webhook-signature': headers.get(`${prefix}-signature`),
  };
}

export async function POST(request: Request) {
  const secret = process.env.LIVEBLOCKS_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('LIVEBLOCKS_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature } =
    readSignatureHeaders(request.headers);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Liveblocks signed
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
    console.error('Liveblocks webhook verification failed:', message);
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

  // Every body is { type, data }: the event name is the camelCase top-level `type`
  const type = event.type;
  const data = event.data && typeof event.data === 'object' ? event.data : {};
  // webhook-id is stable across retries and the body has no event id: use it to deduplicate
  console.log(`Received Liveblocks webhook ${id}: ${type}`);

  switch (type) {
    case 'userEntered':
      console.log('User entered room:', data.roomId, data.userId, `(${data.numActiveUsers} active)`);
      break;
    case 'userLeft':
      console.log('User left room:', data.roomId, data.userId, `(${data.numActiveUsers} active)`);
      break;
    case 'storageUpdated':
      // Throttled at 60 seconds: not sent for every write
      console.log('Storage updated:', data.roomId, data.updatedAt);
      break;
    case 'roomCreated':
      console.log('Room created:', data.roomId);
      break;
    case 'roomDeleted':
      console.log('Room deleted:', data.roomId);
      break;
    case 'ydocUpdated':
      // Throttled at 60 seconds: not sent for every write
      console.log('Yjs document updated:', data.roomId, data.updatedAt);
      break;
    case 'commentCreated':
      console.log('Comment created:', data.commentId, 'in thread', data.threadId);
      break;
    case 'commentEdited':
      console.log('Comment edited:', data.commentId, 'in thread', data.threadId);
      break;
    case 'commentDeleted':
      console.log('Comment deleted:', data.commentId, 'in thread', data.threadId);
      break;
    case 'commentReactionAdded':
      console.log('Reaction added:', data.emoji, 'on comment', data.commentId);
      break;
    case 'commentReactionRemoved':
      console.log('Reaction removed:', data.emoji, 'on comment', data.commentId);
      break;
    case 'threadCreated':
      console.log('Thread created:', data.threadId);
      break;
    case 'threadDeleted':
      console.log('Thread deleted:', data.threadId);
      break;
    case 'threadMetadataUpdated':
      console.log('Thread metadata updated:', data.threadId);
      break;
    case 'commentMetadataUpdated':
      console.log('Comment metadata updated:', data.commentId);
      break;
    case 'threadMarkedAsResolved':
      console.log('Thread resolved:', data.threadId);
      break;
    case 'threadMarkedAsUnresolved':
      console.log('Thread unresolved:', data.threadId);
      break;
    case 'notification':
      // data.kind is 'thread', 'textMention' or a custom '$'-prefixed kind
      console.log('Notification:', data.kind, 'for user', data.userId);
      break;
    default:
      // The documented list may grow: ignore what you don't need
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ received: true, type: type ?? null });
}
