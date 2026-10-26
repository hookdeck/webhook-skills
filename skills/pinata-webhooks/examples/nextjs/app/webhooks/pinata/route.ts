// Generated with: pinata-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.PINATA_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('PINATA_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Read the webhook-* headers (Standard Webhooks); when webhook-id is absent, fall back to the svix-* headers
  const prefix = request.headers.get('webhook-id') ? 'webhook' : 'svix';
  const id = request.headers.get(`${prefix}-id`);
  const timestamp = request.headers.get(`${prefix}-timestamp`);
  const signature = request.headers.get(`${prefix}-signature`);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Pinata (Svix) signed
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
    console.error('Pinata webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The event name is the top-level `event_type`; the two CAR-import events name it `event` instead.
  // The file sits under data.object (data.new_file for pin_by_cid_succeeded).
  const type: string = event.event_type ?? event.event;
  // The webhook-id header identifies the message and is stable across retries: use it to deduplicate
  console.log(`Received Pinata webhook ${id}: ${type}`);

  const file = event.data?.object;
  switch (type) {
    case 'ipfs.private.file_added':
    case 'ipfs.public.file_added':
      console.log(`File added (${type.split('.')[1]}):`, file?.id, file?.cid, file?.name);
      break;
    case 'ipfs.private.file_updated':
    case 'ipfs.public.file_updated':
      // data.previous_attributes holds the values that changed
      console.log(`File updated (${type.split('.')[1]}):`, file?.id, event.data?.previous_attributes);
      break;
    case 'ipfs.private.file_deleted':
    case 'ipfs.public.file_deleted':
      console.log(`File deleted (${type.split('.')[1]}):`, file?.id, file?.cid);
      break;
    case 'ipfs.public.car_import_succeeded':
      console.log('CAR import succeeded:', file?.cid, file?.name);
      break;
    case 'ipfs.public.car_import_failed':
      console.log('CAR import failed:', event.data?.file_id, event.data?.error);
      break;
    case 'ipfs.public.pin_by_cid_added':
      console.log('Pin by CID queued:', file?.id, file?.cid, file?.status);
      break;
    case 'ipfs.public.pin_by_cid_succeeded':
      // The pinned file is data.new_file; data.object is the pin request
      console.log('Pin by CID succeeded:', event.data?.new_file?.id, event.data?.new_file?.cid);
      break;
    case 'ipfs.public.pin_by_cid_failed':
      console.log('Pin by CID failed:', file?.id, file?.cid, file?.status);
      break;
    default:
      // Return 200 for events you don't handle, or Pinata (Svix) keeps retrying them
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ success: true, type });
}
