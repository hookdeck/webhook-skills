// Generated with: launchdarkly-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyLaunchDarklyWebhook } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  const secret = process.env.LAUNCHDARKLY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('LAUNCHDARKLY_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw body as text: the signature covers the exact bytes LaunchDarkly sent
  const rawBody = await request.text();
  const signature = request.headers.get('x-ld-signature');

  if (!signature) {
    // Signing is optional in LaunchDarkly; the webhook must have a secret
    return NextResponse.json({ error: 'Missing X-LD-Signature header' }, { status: 400 });
  }

  if (!verifyLaunchDarklyWebhook(rawBody, signature, secret)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The payload is an audit log entry; the event type is `kind`
  const action = payload.accesses?.[0]?.action;
  console.log(`Received ${payload.kind} change (${action}), id ${payload._id}`);

  switch (payload.kind) {
    case 'flag':
      console.log(`Flag "${payload.name}": ${payload.titleVerb}`);
      // TODO: sync flag state, notify team, update ticket
      break;

    case 'segment':
      console.log(`Segment "${payload.name}": ${payload.titleVerb}`);
      // TODO: invalidate caches
      break;

    case 'project':
      console.log(`Project "${payload.name}": ${payload.titleVerb}`);
      break;

    case 'environment':
      console.log(`Environment "${payload.name}": ${payload.titleVerb}`);
      break;

    default:
      console.log(`Unhandled kind: ${payload.kind}`);
  }

  // Dedupe on payload._id; delivery order is not guaranteed (use payload.date)
  return NextResponse.json({ received: true });
}
