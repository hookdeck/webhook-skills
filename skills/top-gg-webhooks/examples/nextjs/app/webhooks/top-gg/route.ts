// Generated with: top-gg-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyTopGgWebhook } from '../../../lib/top-gg';

// Wrong-typed fields in the (verified but still untrusted) body are treated as absent.
const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const asString = (x: unknown): string | undefined => (typeof x === 'string' ? x : undefined);

export async function POST(request: NextRequest) {
  // Read the raw bytes BEFORE parsing - the signature is over the exact bytes.
  const rawBody = new Uint8Array(await request.arrayBuffer());
  const header = request.headers.get('x-topgg-signature');
  const secret = process.env.TOP_GG_WEBHOOK_SECRET;

  if (!secret) {
    console.error('TOP_GG_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }
  if (!verifyTopGgWebhook(rawBody, header, secret)) {
    console.error('Top.gg webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after verification, and treat every field as untrusted.
  let event: unknown;
  try {
    event = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!isObject(event)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  const data = isObject(event.data) ? event.data : {};
  const user = isObject(data.user) ? data.user : {};
  const project = isObject(data.project) ? data.project : {};

  switch (event.type) {
    case 'vote.create':
      // data.id is the vote ID: deduplicate on it. data.weight is 2 during weekend multipliers.
      console.log(
        `Vote ${asString(data.id)} on ${asString(project.type)} ${asString(project.platform_id)} ` +
          `by ${asString(user.name)} (weight ${typeof data.weight === 'number' ? data.weight : 1})`
      );
      break;
    case 'webhook.test':
      console.log(`Test webhook from ${asString(user.name)} for project ${asString(project.id)}`);
      break;
    default:
      console.log(`Unhandled event type: ${asString(event.type)}`);
  }

  // Any 2xx within 5 seconds acknowledges; timeouts and 5xx are retried (v1: up to 3 times).
  return NextResponse.json({ received: true });
}
