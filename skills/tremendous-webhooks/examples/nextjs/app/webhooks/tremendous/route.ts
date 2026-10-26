// Generated with: tremendous-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify Tremendous-Webhook-Signature: "sha256=<hex>", an HMAC-SHA256 of the raw body
 * keyed with the webhook's private_key.
 */
function verifyTremendousWebhook(rawBody: string, signatureHeader: string | null, privateKey: string | undefined): boolean {
  if (!signatureHeader || !privateKey || !signatureHeader.startsWith('sha256=')) return false;

  const sig = signatureHeader.slice('sha256='.length);
  // Buffer.from(x, 'hex') silently truncates invalid hex, so check the shape first
  if (!/^[0-9a-f]{64}$/i.test(sig)) return false;

  const expected = crypto.createHmac('sha256', privateKey).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected);
}

export async function POST(request: NextRequest) {
  // Raw body for signature verification (any content type)
  const body = await request.text();
  const signature = request.headers.get('tremendous-webhook-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing Tremendous-Webhook-Signature header' }, { status: 400 });
  }

  if (!verifyTremendousWebhook(body, signature, process.env.TREMENDOUS_WEBHOOK_PRIVATE_KEY)) {
    console.error('Tremendous signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after verification
  let event: any;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Tremendous retries up to 17 times unless it gets a 200: dedupe on event.uuid
  const resource = event.payload?.resource;

  switch (event.event) {
    case 'REWARDS.DELIVERY.SUCCEEDED':
      console.log(`Reward ${resource?.id} delivered`);
      break;
    case 'REWARDS.DELIVERY.FAILED':
      console.error(`Reward ${resource?.id} delivery failed:`, event.payload?.meta);
      break;
    case 'REWARDS.CANCELED':
      console.log(`Reward ${resource?.id} canceled`);
      break;
    case 'REWARDS.FLAGGED':
      console.log(`Reward ${resource?.id} flagged for fraud review`);
      break;
    case 'ORDERS.CREATED':
      console.log(`Order ${resource?.id} created`);
      break;
    case 'ORDERS.APPROVED':
      console.log(`Order ${resource?.id} approved`);
      break;
    case 'ORDERS.CANCELED':
      console.log(`Order ${resource?.id} canceled`);
      break;
    case 'ORDERS.FAILED':
      console.error(`Order ${resource?.id} failed`);
      break;
    case 'CAMPAIGNS.CREATED':
      console.log(`Campaign ${resource?.id} created`);
      break;
    case 'FUNDING_SOURCES.FUNDED':
      console.log(`Funding source ${resource?.id} funded`);
      break;
    case 'INVOICES.PAID':
      console.log(`Invoice ${resource?.id} paid`);
      break;
    default:
      console.log(`Unhandled event type: ${event.event}`);
  }

  return NextResponse.json({ received: true });
}
