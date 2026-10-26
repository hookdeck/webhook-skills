import { NextRequest, NextResponse } from 'next/server';
import { verifyHintSignature } from '../../../lib/verify';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export async function POST(request: NextRequest) {
  // Raw body is required: the signature covers the exact bytes Hint sent
  const rawBody = Buffer.from(await request.arrayBuffer());

  const signature = request.headers.get('x-hint-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature header' }, { status: 401 });
  }
  if (!verifyHintSignature(rawBody, signature, process.env.HINT_HEALTH_WEBHOOK_SECRET)) {
    console.error('Hint Health webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after verification, and treat every field as untrusted
  let event: unknown;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!isObject(event)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // The event name is the top-level "type" field; "object" is the affected record
  const type = typeof event.type === 'string' ? event.type : undefined;
  const object = isObject(event.object) ? event.object : undefined;
  const id = typeof event.id === 'string' ? event.id : undefined;

  switch (type) {
    case 'patient.created':
      console.log('Patient created:', id, object);
      break;
    case 'patient.updated':
      console.log('Patient updated:', id, object);
      break;
    case 'patient.destroyed':
      console.log('Patient destroyed:', id, object);
      break;
    case 'patient.inactive':
      console.log('Patient inactive:', id, object);
      break;
    case 'membership.created':
      console.log('Membership created:', id, object);
      break;
    case 'membership.updated':
      console.log('Membership updated:', id, object);
      break;
    case 'membership.destroyed':
      console.log('Membership destroyed:', id, object);
      break;
    case 'practitioner.created':
      console.log('Practitioner created:', id, object);
      break;
    case 'practitioner.updated':
      console.log('Practitioner updated:', id, object);
      break;
    case 'practitioner.destroyed':
      console.log('Practitioner destroyed:', id, object);
      break;
    default:
      console.log('Unhandled event type:', type);
  }

  // Delivery is at least once: dedupe on the envelope id, and reply 2xx within 20 seconds
  return NextResponse.json({ received: true });
}
