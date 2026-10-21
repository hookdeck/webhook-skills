import { NextRequest, NextResponse } from 'next/server';
import { isPing, verifyBobSignature } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  // Raw body is required: the signature covers the exact bytes Bob sent
  const rawBody = await request.text();

  // Answer the connection test immediately with 200
  if (isPing(rawBody)) {
    return new NextResponse('OK', { status: 200 });
  }

  const signature = request.headers.get('bob-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing Bob-Signature header' }, { status: 400 });
  }
  if (!verifyBobSignature(rawBody, signature, process.env.HIBOB_WEBHOOK_SECRET)) {
    console.error('Bob webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after verification
  let event: { type?: string; data?: unknown };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The event name is the "type" field; payloads carry IDs, fetch details via Bob's API
  switch (event.type) {
    case 'employee.created':
      console.log('Employee created:', event.data);
      break;
    case 'employee.updated':
      console.log('Employee updated:', event.data);
      break;
    case 'employee.joined':
      console.log('Employee joined:', event.data);
      break;
    case 'employee.left':
      console.log('Employee left:', event.data);
      break;
    case 'timeoff.request.requested':
      console.log('Time off requested:', event.data);
      break;
    case 'timeoff.request.approved':
      console.log('Time off approved:', event.data);
      break;
    default:
      console.log('Unhandled event type:', event.type);
  }

  return NextResponse.json({ received: true });
}
