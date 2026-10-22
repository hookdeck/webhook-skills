import { NextRequest, NextResponse } from 'next/server';
import { verifyCheckWebhook } from '../../../lib/check';

export async function POST(request: NextRequest) {
  // Raw body, read as text before any JSON parsing
  const body = await request.text();
  const signature = request.headers.get('check-signature');
  const topic = request.headers.get('check-topic');
  const eventId = request.headers.get('check-webhookevent-id');

  const key = process.env.CHECK_WEBHOOK_KEY;
  if (!key) {
    console.error('CHECK_WEBHOOK_KEY is not set');
    return NextResponse.json({ error: 'Webhook key not configured' }, { status: 500 });
  }

  if (!verifyCheckWebhook(body, signature, key)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload after verification
  let payload: { event?: string; data?: Record<string, any>; message?: string };
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The ping test webhook is a flat {"message": "Test webhook"} body
  if (topic === 'ping' || (payload.event === undefined && payload.message)) {
    console.log('Ping received:', payload.message);
    return NextResponse.json({ received: true });
  }

  const { event, data = {} } = payload;
  console.log(`Received ${topic} ${event} (id: ${eventId})`);

  // Topic is in the Check-Topic header; event is in the body
  switch (`${topic} ${event}`) {
    case 'payroll created':
    case 'payroll updated':
      console.log(`Payroll ${data.id} ${event}: status ${data.status}`);
      // TODO: Fetch the latest payroll from the Check API and sync your records
      break;

    case 'payroll status_change': // deprecated in API version 2025-01-01
      console.log(`Payroll ${data.id} status changed to ${data.status}`);
      break;

    case 'payment status_change':
      console.log(`Payment ${data.id} is now ${data.status}`);
      // TODO: Handle processing, paid, failed or refunded
      break;

    case 'employee created':
    case 'employee updated':
      console.log(`Employee ${data.id} ${event}`);
      // TODO: Sync the employee into your database
      break;

    default:
      console.log(`Unhandled event: ${topic} ${event}`);
  }

  // Return 2XX within 5 seconds, even for events you ignore
  return NextResponse.json({ received: true });
}
