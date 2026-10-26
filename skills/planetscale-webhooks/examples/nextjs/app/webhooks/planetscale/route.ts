// Generated with: planetscale-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyPlanetScaleWebhook } from '../../../lib/verify';

function isObject(v: unknown): v is Record<string, any> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export async function POST(request: NextRequest) {
  // Raw bytes: the signature covers exactly what PlanetScale sent
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-planetscale-signature');

  if (!verifyPlanetScaleWebhook(rawBody, signature, process.env.PLANETSCALE_WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse the payload only after verification, and treat every field as untrusted
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!isObject(payload)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const event = typeof payload.event === 'string' ? payload.event : undefined;
  const resource = isObject(payload.resource) ? payload.resource : {};
  const database = typeof payload.database === 'string' ? payload.database : undefined;
  // No delivery ID header: dedupe on event + resource.id + timestamp if you need idempotency

  switch (event) {
    case 'webhook.test':
      console.log(`Received webhook.test for database ${database}`);
      break;

    case 'branch.ready':
      console.log(`Branch ${resource.name} is ready on ${database}`);
      // TODO: Run migrations, post connection details to a channel
      break;

    case 'branch.anomaly':
      console.log(`Anomaly on branch ${resource.name} of ${database}: ${resource.html_url}`);
      // TODO: Page on-call, open a ticket
      break;

    case 'deploy_request.opened':
    case 'deploy_request.queued':
    case 'deploy_request.in_progress':
      console.log(
        `${event}: deploy request #${resource.number} ` +
        `(${resource.branch} -> ${resource.into_branch}) on ${database}`
      );
      // TODO: Notify reviewers, update the linked ticket or CI status
      break;

    case 'backup.failed':
      console.log(`Backup ${resource.name} failed on ${database}`);
      // TODO: Alert the team
      break;

    case 'backup.succeeded':
      console.log(`Backup ${resource.name} succeeded on ${database}`);
      // TODO: Record backup health
      break;

    case 'cluster.storage':
      console.log(`Storage at ${resource.storage_percentage}% on ${resource.branch_name} (${database})`);
      // TODO: Capacity alert
      break;

    case 'database.access_request':
      console.log(`PlanetScale access request (${resource.state}) on ${database}`);
      // TODO: Notify database admins to review it
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }

  // Return 200 quickly: PlanetScale waits 2 seconds, then marks the delivery failed
  return NextResponse.json({ received: true });
}
