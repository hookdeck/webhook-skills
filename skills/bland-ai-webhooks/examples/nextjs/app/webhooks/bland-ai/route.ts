// Generated with: bland-ai-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { verifyBlandSignature } from '../../../lib/bland';

// Bland sends no event name on the standard post-call payload. Voice calls
// carry call_id + status; enrichments add event_type; SMS carries
// conversation_id. Payloads are additive, so ignore keys you don't recognise.
interface BlandPayload {
  call_id?: string;
  conversation_id?: string;
  status?: string;
  event_type?: string; // "citations" | "post_transfer_transcript" | "evals" | "multiple"
  contents?: string[];
  error_message?: string | null;
  call_length?: number;
  transcripts?: unknown[];
  citations?: unknown[];
  [key: string]: unknown;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// The same call_id can legitimately arrive more than once (post-call, then
// citations / evals), so the key includes the payload's event_type.
const processedKeys = new Set<string>();

function dedupeKey(payload: BlandPayload): string | null {
  const id = payload.call_id || payload.conversation_id;
  return id ? `${id}:${payload.event_type || payload.status || 'post_call'}` : null;
}

function handlePayload(payload: BlandPayload): void {
  if (payload.conversation_id) {
    console.log(`SMS conversation ${payload.conversation_id} (${payload.status || 'message'})`);
    return;
  }

  switch (payload.event_type) {
    case 'citations':
      console.log(`Call ${payload.call_id}: ${(payload.citations || []).length} citations`);
      return;
    case 'post_transfer_transcript':
      console.log(`Call ${payload.call_id}: post-transfer transcript received`);
      return;
    case 'evals':
      console.log(`Call ${payload.call_id}: eval scores received`);
      return;
    case 'multiple':
      console.log(`Call ${payload.call_id}: combined payload (${(payload.contents || []).join(', ')})`);
      return;
    default:
      break;
  }

  // Standard post-call payload.
  if (payload.error_message) {
    // Call failures still arrive as a normal 200 delivery with the error in the payload.
    console.log(`Call ${payload.call_id} failed: ${payload.error_message}`);
  } else if (payload.status === 'completed') {
    const turns = Array.isArray(payload.transcripts) ? payload.transcripts.length : 0;
    console.log(`Call ${payload.call_id} completed (${payload.call_length} min, ${turns} transcript turns)`);
  } else {
    console.log(`Call ${payload.call_id} status: ${payload.status}`);
  }
}

export async function POST(request: Request) {
  const secret = process.env.BLAND_WEBHOOK_SECRET;
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!secret) {
    console.error('BLAND_WEBHOOK_SECRET is not set, rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const signature = request.headers.get('x-webhook-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Webhook-Signature header' }, { status: 400 });
  }

  // Raw body: request.json() would re-serialise and can break the HMAC. text()
  // works for any content type Bland sends.
  const rawBody = await request.text();

  if (!verifyBlandSignature(rawBody, signature, secret)) {
    console.error('Bland webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let payload: BlandPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const key = dedupeKey(payload);
  if (key && processedKeys.has(key)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Keep this fast and return 2xx; store or enqueue the payload and process it afterwards.
    handlePayload(payload);
    if (key) processedKeys.add(key);
  } catch (err) {
    console.error('Error handling Bland payload:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
