// Generated with: baseten-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import { verifyBasetenSignature } from '../../../lib/baseten';

interface BasetenEvent {
  request_id?: string;
  model_id?: string;
  deployment_id?: string;
  type?: string;
  time?: string;
  data?: { output?: unknown } | null;
  errors?: Array<{ code?: string; message?: string }>;
}

// Success and failure share the same event type; `data` and `errors` tell them apart.
function handleAsyncRequestCompleted(event: BasetenEvent): string {
  const failed = !event.data || (Array.isArray(event.errors) && event.errors.length > 0);
  if (failed) {
    console.log(`Async request ${event.request_id} failed:`, JSON.stringify(event.errors));
    return 'failed';
  }
  console.log(`Async request ${event.request_id} completed for model ${event.model_id}`);
  return 'succeeded';
}

export async function POST(request: Request) {
  const secret = process.env.BASETEN_WEBHOOK_SECRET;
  if (!secret) {
    console.error('BASETEN_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const signature = request.headers.get('x-baseten-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing X-BASETEN-SIGNATURE header' }, { status: 401 });
  }

  // Read the exact bytes; do not parse JSON before verifying
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyBasetenSignature(rawBody, signature, secret)) {
    console.error('Baseten signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: BasetenEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (event === null || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  switch (event.type) {
    case 'async_request_completed':
      return NextResponse.json({ received: true, outcome: handleAsyncRequestCompleted(event) });
    default:
      console.log(`Unhandled Baseten event type: ${event.type}`);
      return NextResponse.json({ received: true, outcome: 'ignored' });
  }
}
