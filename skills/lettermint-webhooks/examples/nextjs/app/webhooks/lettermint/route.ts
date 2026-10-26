// Generated with: lettermint-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyLettermintWebhook } from '../../../lib/lettermint';

interface LettermintEvent {
  id: string;
  event: string;
  timestamp: string;
  data?: Record<string, any> | null;
}

export async function POST(request: NextRequest) {
  const header = request.headers.get('x-lettermint-signature');
  const secret = process.env.LETTERMINT_WEBHOOK_SECRET;

  if (!secret) {
    console.error('LETTERMINT_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }
  if (!header) {
    return NextResponse.json({ error: 'Missing X-Lettermint-Signature header' }, { status: 401 });
  }

  // Read the raw bytes BEFORE parsing - the signature is over the exact body.
  const rawBody = new Uint8Array(await request.arrayBuffer());
  if (!verifyLettermintWebhook(rawBody, header, secret)) {
    console.error('Lettermint webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after verification.
  let payload: LettermintEvent;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (payload === null || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { id, event, data } = payload;
  switch (event) {
    case 'message.delivered':
      console.log(`Message delivered to ${data?.recipient}: ${data?.message_id}`);
      break;
    case 'message.hard_bounced':
      console.log(`Hard bounce for ${data?.recipient}: remove from lists`);
      break;
    case 'message.soft_bounced':
      console.log(`Soft bounce for ${data?.recipient}: ${data?.message_id}`);
      break;
    case 'message.spam_complaint':
      console.log(`Spam complaint from ${data?.recipient}: stop mailing`);
      break;
    case 'message.failed':
      console.log(`Message failed (${data?.reason_code}): ${data?.message_id}`);
      break;
    case 'suppression.added':
      console.log(`Suppression added: ${data?.value} (${data?.reason})`);
      break;
    case 'webhook.test':
      console.log('Received Lettermint test event');
      break;
    default:
      console.log(`Unhandled event type: ${event}`);
  }
  // TODO: persist / forward. `id` is unique per event: use it as the idempotency key.
  console.log(`Processed ${event} (id ${id})`);

  // Respond 2XX quickly; timeouts, 408, 429 and 5xx are retried (12 attempts over ~14 hours).
  return NextResponse.json({ received: true });
}
