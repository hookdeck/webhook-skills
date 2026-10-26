// Generated with: justt-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

export const dynamic = 'force-dynamic';

// Justt sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent
function readSignatureHeaders(headers: Headers) {
  const prefix = headers.get('webhook-id') ? 'webhook' : 'svix';
  return {
    'webhook-id': headers.get(`${prefix}-id`),
    'webhook-timestamp': headers.get(`${prefix}-timestamp`),
    'webhook-signature': headers.get(`${prefix}-signature`),
  };
}

export async function POST(request: Request) {
  const secret = process.env.JUSTT_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('JUSTT_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature } =
    readSignatureHeaders(request.headers);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Justt signed
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
    console.error('Justt webhook verification failed:', message);
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

  // The envelope is { type, timestamp, data }; the event name is the top-level type
  const type = event.type;
  const data = event.data ?? {};
  // webhook-id is stable across retries and the body has no event id: use it to deduplicate
  console.log(`Received Justt webhook ${id}: ${type}`);

  switch (type) {
    case 'chargeback.created':
      console.log('Chargeback created:', data.chargebackId);
      break;
    case 'chargeback.updated':
      console.log('Chargeback updated:', data.chargebackId);
      break;
    case 'chargeback.status.updated':
      console.log('Chargeback status updated:', data.chargebackId, data.status);
      break;
    case 'chargeback.evidence.submitted':
      // data.status is succeeded | failed
      console.log('Chargeback evidence submitted:', data.chargebackId, data.status);
      break;
    case 'chargeback.accepted':
      // data.status is succeeded | failed
      console.log('Chargeback accepted:', data.chargebackId, data.status);
      break;
    case 'pre_chargeback_alert.received':
      console.log('Pre-chargeback alert received:', data.internalAlertId);
      break;
    case 'pre_chargeback_alert.refund.succeeded':
      console.log('Alert refund succeeded:', data.internalAlertId);
      break;
    case 'pre_chargeback_alert.refund.failed':
      console.log('Alert refund failed:', data.internalAlertId);
      break;
    case 'pre_chargeback_alert.transaction_matched':
      // Opt-in: only sent when Justt enables additional event types for your account
      console.log('Alert transaction matched:', data.internalAlertId);
      break;
    case 'subscription.cancel_immediately.success':
      console.log('Subscription cancelled:', data.subscriptionId);
      break;
    case 'subscription.cancel_immediately.failed':
      console.log('Subscription cancel failed:', data.subscriptionId, data.failureCode);
      break;
    default:
      // The documented list may grow: ignore what you don't need
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ received: true, type: type ?? null });
}
