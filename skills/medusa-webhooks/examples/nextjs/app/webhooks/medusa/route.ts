// Generated with: medusa-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyMedusaWebhook } from '../../../lib/medusa';

interface MedusaEvent {
  id: string;
  type: string;
  created_at: string;
  data: {
    build?: { id: string; commit_hash?: string };
    deployment?: { id: string };
    project?: { handle?: string };
    environment?: { handle?: string };
  };
}

export async function POST(request: NextRequest) {
  // Read the raw body BEFORE parsing - the signature is over the exact bytes.
  // request.text() works for any content type.
  const rawBody = await request.text();
  const header = request.headers.get('x-medusa-signature');
  const secret = process.env.MEDUSA_WEBHOOK_SECRET;

  if (!header) {
    return NextResponse.json({ error: 'Missing X-Medusa-Signature header' }, { status: 400 });
  }
  if (!secret) {
    console.error('MEDUSA_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }
  if (!verifyMedusaWebhook(rawBody, header, secret)) {
    console.error('Medusa webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after verification. The body is one event object: { id, type, data, created_at }.
  let event: MedusaEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return NextResponse.json({ error: 'Expected an event object' }, { status: 400 });
  }

  const { id, type, data } = event;
  const where = `${data?.project?.handle}/${data?.environment?.handle}`;
  switch (type) {
    case 'build.created':
      console.log(`Build created for ${where}: ${data?.build?.id}`);
      break;
    case 'build.succeeded':
      console.log(`Build succeeded for ${where}: ${data?.build?.id} (${data?.build?.commit_hash})`);
      break;
    case 'build.failed':
      console.log(`Build failed for ${where}: ${data?.build?.id}`);
      break;
    case 'build.canceled':
      console.log(`Build canceled for ${where}: ${data?.build?.id}`);
      break;
    case 'deployment.created':
      console.log(`Deployment created for ${where}: ${data?.deployment?.id}`);
      break;
    case 'deployment.succeeded':
      console.log(`Deployment succeeded for ${where}: ${data?.deployment?.id}`);
      break;
    case 'deployment.failed':
      console.log(`Deployment failed for ${where}: ${data?.deployment?.id}`);
      break;
    case 'deployment.canceled':
      console.log(`Deployment canceled for ${where}: ${data?.deployment?.id}`);
      break;
    default:
      console.log(`Unhandled event type: ${type}`);
  }
  // TODO: persist / forward. `id` (also the X-Medusa-Delivery header) is reused across
  // retries of the same event: use it as the idempotency key.
  console.log(`Processed delivery ${id}`);

  // Respond 2xx within ten seconds, otherwise Medusa retries (it doesn't follow redirects).
  return NextResponse.json({ received: true });
}
