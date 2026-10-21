import { NextRequest, NextResponse } from 'next/server';
import { verifySignature, handleEvent } from '../../../lib/modern-treasury';

// Signature verification needs the Node crypto module and the raw body.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Webhook IDs we have already processed. Use a database or Redis in production.
const processedWebhooks = new Set<string>();

export async function POST(request: NextRequest) {
  const webhookKey = process.env.MODERN_TREASURY_WEBHOOK_KEY;
  if (!webhookKey) {
    console.error('MODERN_TREASURY_WEBHOOK_KEY is not set');
    return NextResponse.json({ error: 'Webhook key not configured' }, { status: 500 });
  }

  const signature = request.headers.get('x-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Signature header' }, { status: 400 });
  }

  // Read the raw body as text: the signature covers the exact bytes sent.
  const rawBody = await request.text();

  if (!verifySignature(rawBody, signature, webhookKey)) {
    console.error('Modern Treasury signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let payload: { event: string; data?: Record<string, any> };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const topic = request.headers.get('x-topic');
  const webhookId = request.headers.get('x-webhook-id');

  // X-Webhook-ID stays the same across retries of one webhook
  if (webhookId && processedWebhooks.has(webhookId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    handleEvent(topic, payload.event, payload.data || {});
    if (webhookId) processedWebhooks.add(webhookId);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Error handling webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }
}
