// Generated with: complycube-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyComplyCubeSignature } from '../../../lib/complycube';

export async function POST(request: NextRequest) {
  const secret = process.env.COMPLYCUBE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('COMPLYCUBE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw bytes BEFORE parsing: the signature covers the exact body (any content type)
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('complycube-signature');

  if (!verifyComplyCubeSignature(rawBody, signature, secret)) {
    console.error('ComplyCube webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after verification
  let event: { id?: string; type?: string; payload?: { id?: string } };
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof event !== 'object' || event === null || typeof event.type !== 'string') {
    return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
  }

  // event.id is stable across retries: use it for idempotency (duplicates and reordering happen)
  switch (event.type) {
    case 'check.completed':
      console.log(`Check ${event.payload?.id} completed (any outcome) [event ${event.id}]`);
      break;
    case 'check.completed.clear':
    case 'check.completed.attention':
    case 'check.completed.rejected':
    case 'check.completed.match_confirmed':
      console.log(`Check ${event.payload?.id} outcome: ${event.type.split('.')[2]} [event ${event.id}]`);
      break;
    case 'check.failed':
      console.log(`Check ${event.payload?.id} failed [event ${event.id}]`);
      break;
    case 'client.created':
      console.log(`Client ${event.payload?.id} created [event ${event.id}]`);
      break;
    case 'workflow.session.completed':
      console.log(`Workflow session ${event.payload?.id} completed [event ${event.id}]`);
      break;
    default:
      console.log(`Unhandled ComplyCube event: ${event.type} [event ${event.id}]`);
  }

  // Acknowledge with a 20x within 15 seconds, or ComplyCube retries and eventually disables the webhook
  return NextResponse.json({ received: true });
}
