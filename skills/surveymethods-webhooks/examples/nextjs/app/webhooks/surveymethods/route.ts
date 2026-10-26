// Generated with: surveymethods-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifySurveyMethodsSignature } from '../../../lib/surveymethods';

export async function POST(request: NextRequest) {
  const secret = process.env.SURVEYMETHODS_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SURVEYMETHODS_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw bytes BEFORE parsing: the signature covers the exact body (any content type)
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-surveymethods-signature');

  if (!verifySurveyMethodsSignature(rawBody, signature, secret)) {
    console.error('SurveyMethods webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: { eventId?: string; eventType?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof event !== 'object' || event === null || Array.isArray(event)) {
    return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
  }

  // Delivery is at-least-once (up to 5 attempts): deduplicate on event.eventId
  switch (event.eventType) {
    case 'response.completed':
      console.log(`Response completed on survey ${event.data?.surveyId} (event ${event.eventId})`);
      break;
    case 'response.created':
      console.log(`Response started on survey ${event.data?.surveyId} (event ${event.eventId})`);
      break;
    case 'survey.created':
      console.log(`Survey created: ${event.data?.surveyId} (event ${event.eventId})`);
      break;
    case 'collector.created':
      console.log(`Collector created: ${event.data?.collectorId} (event ${event.eventId})`);
      break;
    default:
      console.log(`Unhandled SurveyMethods event: ${event.eventType}`);
  }

  return NextResponse.json({ received: true });
}
