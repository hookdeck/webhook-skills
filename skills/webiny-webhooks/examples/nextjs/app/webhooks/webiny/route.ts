// Generated with: webiny-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { readSignatureHeaders, verifyWebinyWebhook } from '../../../lib/verify';

// In-memory dedupe for the demo. Use Redis or your database in production.
// Retries reuse the same webhook-id.
const processedMessageIds = new Set<string>();

// Envelope: {id, event, timestamp, webhookId, deliveryId, tenant, data}.
// Event names are registered at runtime by the installed Webiny apps and shown
// in the admin, so dispatch on the envelope's `event` string.
function handleEvent(envelope: Record<string, any>) {
  const { event, tenant, webhookId, deliveryId, data } = envelope;
  console.log(`Webiny event "${event}" (tenant ${tenant}, webhook ${webhookId}, delivery ${deliveryId})`);

  switch (event) {
    // Add cases for the events you subscribed to in the Webiny admin.
    default:
      console.log('Event data:', JSON.stringify(data));
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.WEBINY_WEBHOOK_SECRET;
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!secret) {
    console.error('WEBINY_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes: the signature covers the exact body, so read it before any JSON parsing.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const tolerance = parseInt(process.env.WEBINY_WEBHOOK_TOLERANCE_SECONDS || '0', 10) || 0;

  const result = verifyWebinyWebhook(rawBody, request.headers, secret, tolerance);
  if (!result.valid) {
    console.error('Webiny webhook verification failed:', result.error);
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  let envelope: Record<string, any>;
  try {
    envelope = JSON.parse(rawBody.toString('utf8')); // parse only after verifying
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const messageId = readSignatureHeaders(request.headers).id as string;
  if (processedMessageIds.has(messageId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    handleEvent(envelope);
    processedMessageIds.add(messageId);
  } catch (err) {
    console.error('Error handling Webiny event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
