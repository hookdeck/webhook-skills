import { NextRequest, NextResponse } from 'next/server';
import { verifyUseSend, withinTolerance } from '../../../lib/usesend';

export async function POST(request: NextRequest) {
  const secret = process.env.USESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('USESEND_WEBHOOK_SECRET is not set');
    return new NextResponse('Webhook secret not configured', { status: 500 });
  }

  // Raw bytes: the signature covers the exact body, so don't parse it first.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-usesend-signature');
  const timestamp = request.headers.get('x-usesend-timestamp');

  if (!verifyUseSend(rawBody, signature, timestamp, secret)) {
    return new NextResponse('Invalid signature', { status: 401 });
  }
  const tolerance = Number(process.env.USESEND_WEBHOOK_TOLERANCE_SECONDS || 0);
  if (!withinTolerance(timestamp as string, tolerance)) {
    return new NextResponse('Timestamp outside tolerance', { status: 401 });
  }

  // Parse only after the signature check.
  let event: { id?: string; type?: string; data?: any; webhookId?: string };
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  // Duplicates are possible: dedupe on event.id in production.
  switch (event.type) {
    case 'email.delivered':
      console.log('Email delivered to:', event.data?.to);
      break;
    case 'email.bounced':
      console.log('Email bounced:', event.data?.id, event.data?.bounce?.type);
      break;
    case 'email.complained':
      console.log('Spam complaint for email:', event.data?.id);
      break;
    case 'email.opened':
      console.log('Email opened:', event.data?.id);
      break;
    case 'email.clicked':
      console.log('Link clicked:', event.data?.click?.url);
      break;
    case 'contact.created':
      console.log('Contact created:', event.data?.email);
      break;
    case 'domain.verified':
      console.log('Domain verified:', event.data?.name);
      break;
    case 'webhook.test':
      console.log('Test webhook received:', event.data?.webhookId ?? event.webhookId);
      break;
    default:
      console.log('Unhandled event type:', event.type);
  }

  return new NextResponse('ok', { status: 200 });
}
