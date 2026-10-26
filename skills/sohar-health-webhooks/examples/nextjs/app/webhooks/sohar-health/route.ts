// Generated with: sohar-health-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.SOHAR_HEALTH_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('SOHAR_HEALTH_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
  const prefix = request.headers.get('svix-id') ? 'svix' : 'webhook';
  const id = request.headers.get(`${prefix}-id`);
  const timestamp = request.headers.get(`${prefix}-timestamp`);
  const signature = request.headers.get(`${prefix}-signature`);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Sohar Health (Svix) signed
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
    console.error('Sohar Health webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Bodies are flat: `event` plus the resource id (verificationId | discoveryId | flowRunId).
  // `status` is the resource's state, not the event type. Sandbox events carry a `sandbox.` prefix.
  const event: string = payload.event;
  // No retry schedule or ordering is documented: deduplicate on svix-id (or resource id + status)
  console.log(`Received Sohar Health webhook ${event}`);

  switch (event) {
    case 'verification.updated':
    case 'sandbox.verification.updated':
      // A verification completed (e.g. status "complete.eligible")
      console.log('Verification updated:', payload.verificationId, payload.id, payload.status);
      break;
    case 'verification.pending':
    case 'sandbox.verification.pending':
      // Not resolved immediately; a verification.updated follows when it completes
      console.log('Verification pending:', payload.verificationId, payload.id, payload.status);
      break;
    case 'discovery.updated':
    case 'sandbox.discovery.updated':
      console.log('Discovery updated:', payload.discoveryId, payload.id, payload.status);
      break;
    case 'flow.updated':
    case 'sandbox.flow.updated':
      console.log('Flow run updated:', payload.flowRunId, payload.flowId, payload.status, payload.stateId);
      break;
    case 'flow.callback':
    case 'sandbox.flow.callback':
      // The flow run is waiting for input; `input` is a JSON Schema describing it
      console.log('Flow run awaiting input:', payload.flowRunId, JSON.stringify(payload.input));
      break;
    default:
      // Return 200 for events you don't handle (the documented list may not be exhaustive)
      console.log('Unhandled event:', event);
  }

  return NextResponse.json({ success: true, event });
}
