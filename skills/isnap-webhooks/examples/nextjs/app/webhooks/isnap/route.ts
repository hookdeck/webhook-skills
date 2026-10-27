// Generated with: isnap-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

export const dynamic = 'force-dynamic';

// iSnap sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent
function readSignatureHeaders(headers: Headers) {
  const prefix = headers.get('webhook-id') ? 'webhook' : 'svix';
  return {
    'webhook-id': headers.get(`${prefix}-id`),
    'webhook-timestamp': headers.get(`${prefix}-timestamp`),
    'webhook-signature': headers.get(`${prefix}-signature`),
  };
}

// ISNAP_WEBHOOK_SECRET is one whsec_ secret, or a comma-separated list while you rotate:
// iSnap signs with the new secret only, from the moment you rotate
function readSecrets(): string[] | null {
  const secrets = (process.env.ISNAP_WEBHOOK_SECRET ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return secrets.length > 0 && secrets.every((s) => s.startsWith('whsec_')) ? secrets : null;
}

// Demo only: use a database or cache with a TTL in production
const seenEventIds = new Set<string>();

export async function POST(request: Request) {
  const secrets = readSecrets();
  if (!secrets) {
    console.error('ISNAP_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature } =
    readSignatureHeaders(request.headers);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes iSnap signed
  const rawBody = await request.text();
  const sigHeaders = { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature };

  // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
  // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
  const verified = secrets.some((secret) => {
    try {
      new Webhook(secret).verify(rawBody, sigHeaders, { jsonParse: false });
      return true;
    } catch {
      return false;
    }
  });
  if (!verified) {
    console.error('iSnap webhook verification failed');
    // Never answer 410: iSnap turns the subscription off
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: { event_id?: string; event_type?: string; data?: Record<string, any> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof event !== 'object' || event === null) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The envelope is { api_version, event_id, event_type, created_at, trace_id, data };
  // event_id equals the webhook-id header and is the dedupe key
  const eventId = event.event_id ?? id;
  const type = event.event_type;
  const data = event.data ?? {};

  if (seenEventIds.has(eventId)) {
    console.log(`Duplicate iSnap event ${eventId}: ${type}`);
    return new Response(null, { status: 204 });
  }
  seenEventIds.add(eventId);
  console.log(`Received iSnap webhook ${eventId}: ${type}`);

  switch (type) {
    case 'message.received':
      console.log('Message received:', data.message?.id, 'in chat', data.chat_id);
      break;
    case 'message.queued':
    case 'message.scheduled':
    case 'message.sent':
    case 'message.delivered':
    case 'message.read':
    case 'message.failed':
    case 'message.cancelled':
    case 'message.fallback_triggered':
      console.log(`Message status ${type}:`, data.message?.id);
      break;
    case 'reaction.added':
    case 'reaction.received':
    case 'reaction.removed':
      console.log(`Reaction event ${type}`);
      break;
    case 'typing_indicator.started':
    case 'typing_indicator.stopped':
      console.log(`Typing indicator event ${type}`);
      break;
    case 'line.connected':
    case 'line.disconnected':
    case 'line.offline':
    case 'line.degraded':
    case 'line.apple_id_flagged':
    case 'line.quota_warning':
    case 'line.quota_exceeded':
    case 'line.capability_changed':
    case 'line.terminated':
    case 'line.variant_changed':
    case 'line.variant_scheduled':
    case 'line.variant_unscheduled':
      console.log(`Line event ${type}:`, data.line_metadata);
      break;
    case 'trial.linked':
    case 'trial.dormant':
    case 'trial.reactivated':
    case 'trial.bind_conflict':
    case 'trial.revoked':
      console.log(`Trial event ${type}`);
      break;
    case 'pre_order.fulfilled':
    case 'pre_order.cancelled':
      console.log(`Pre-order event ${type}`);
      break;
    case 'macos_session.rented':
    case 'macos_session.released':
      console.log(`macOS session event ${type}`);
      break;
    case 'binding.released':
      console.log('Binding released');
      break;
    case 'webhook.test':
      // A signed probe to a suspended subscription: a 2xx resumes it
      console.log('Probe received: subscription will resume');
      break;
    default:
      // Events can arrive out of order and the documented list may grow: ignore what you don't need
      console.log('Unhandled event type:', type);
  }

  // 2xx within 10 seconds with an empty body; do slow work after responding in production
  return new Response(null, { status: 204 });
}
