import { NextRequest, NextResponse } from 'next/server';
import { verifyZenefitsSignature } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  // Raw body is required: the signature covers the exact bytes Zenefits sent
  const rawBody = await request.text();

  const signature = request.headers.get('signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature header' }, { status: 401 });
  }
  if (!verifyZenefitsSignature(rawBody, signature, process.env.ZENEFITS_WEBHOOK_SECRET)) {
    console.error('Zenefits webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after verification
  let event: { type?: string; data?: unknown };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The event name is the "type" field; "data" matches the REST API for the object
  switch (event.type) {
    case 'companies.did_change':
      console.log('Company changed:', event.data);
      break;
    case 'people.did_create':
      console.log('Person created:', event.data);
      break;
    case 'people.did_change':
      console.log('Person changed:', event.data);
      break;
    case 'employments.did_start':
      console.log('Employment started:', event.data);
      break;
    case 'employments.did_terminate':
      console.log('Employment terminated:', event.data);
      break;
    case 'flow.did_complete.hiring':
      console.log('Hiring flow completed:', event.data);
      break;
    default:
      console.log('Unhandled event type:', event.type);
  }

  // Any 2xx acknowledges receipt; Zenefits retries non-2xx for up to 1 hour
  return NextResponse.json({ received: true });
}
