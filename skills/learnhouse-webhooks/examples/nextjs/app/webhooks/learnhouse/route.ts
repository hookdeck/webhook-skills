// Generated with: learnhouse-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyLearnhouseSignature, isObject, str, isDuplicateDelivery } from '../../../lib/learnhouse';

export async function POST(request: NextRequest) {
  // Read the raw bytes BEFORE parsing: the signature covers the exact body
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (
    !verifyLearnhouseSignature(
      rawBody,
      request.headers.get('x-webhook-signature'),
      process.env.LEARNHOUSE_WEBHOOK_SECRET
    )
  ) {
    console.error('LearnHouse signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after verification, and treat every field as untrusted
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!isObject(payload) || typeof payload.event !== 'string') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const event = payload.event;
  const deliveryId = str(payload.delivery_id) ?? request.headers.get('x-webhook-delivery') ?? undefined;
  if (isDuplicateDelivery(deliveryId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const data = isObject(payload.data) ? payload.data : {};
  const user = isObject(data.user) ? data.user : {};
  const course = isObject(data.course) ? data.course : {};

  switch (event) {
    case 'ping':
      console.log('LearnHouse ping received');
      break;
    case 'course_enrolled':
      console.log(`${str(user.email)} enrolled in ${str(course.name)}`);
      break;
    case 'course_completed':
      console.log(`${str(user.email)} completed ${str(course.name)}`);
      // e.g. send a certificate email, update your CRM
      break;
    case 'activity_completed':
    case 'assignment_submitted':
    case 'assignment_graded':
    case 'certificate_claimed':
      console.log(`LearnHouse ${event} (delivery ${deliveryId})`);
      break;
    case 'user_signed_up':
      console.log(`New LearnHouse user: ${str(user.email)}`);
      break;
    default:
      console.log(`Unhandled LearnHouse event: ${event}`);
  }

  // Any 2xx marks the delivery successful
  return NextResponse.json({ received: true });
}
