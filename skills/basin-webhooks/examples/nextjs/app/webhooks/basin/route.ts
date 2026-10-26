// Generated with: basin-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyBasinSignature, parseSubmission } from '../../../lib/basin';

// Basin has no event types: every webhook is a form submission.
export async function POST(request: NextRequest) {
  const secret = process.env.BASIN_WEBHOOK_SECRET;
  if (!secret) {
    console.error('BASIN_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw body BEFORE parsing: the signature covers the exact bytes (any content type)
  const rawBody = await request.text();
  const signature = request.headers.get('x-basin-signature');

  if (!verifyBasinSignature(rawBody, signature, secret)) {
    console.error('Basin webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let submission: Record<string, unknown>;
  try {
    submission = parseSubmission(rawBody, request.headers.get('content-type'));
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // Use the submission id for idempotency (Basin retries failed deliveries up to 15 times)
  console.log(`Basin form submission ${submission.id ?? '(no id)'} from ${submission.email ?? 'unknown'}`);

  return NextResponse.json({ received: true });
}
