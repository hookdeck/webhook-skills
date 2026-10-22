import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Verify a Trigger.dev alert webhook: x-trigger-signature-hmacsha256 is the bare hex
// HMAC-SHA256 of the raw body, keyed with the alert webhook secret as UTF-8.
function verifySignature(rawBody: string, signature: string | null, secret: string | undefined): boolean {
  if (!signature || !secret) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  // timingSafeEqual throws when lengths differ, so treat that as invalid
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Read the raw text body; parsing JSON first would change the signed bytes
  const rawBody = await request.text();
  const signature = request.headers.get('x-trigger-signature-hmacsha256');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature header' }, { status: 400 });
  }

  if (!verifySignature(rawBody, signature, process.env.TRIGGER_DEV_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The event type is in the body (there is no event-type header)
  switch (event.type) {
    case 'alert.run.failed':
      console.log(`Run ${event.object.run.id} of task ${event.object.task.id} failed`);
      // TODO: Page on-call, open an incident, etc.
      break;

    case 'alert.deployment.success':
      console.log(`Deployment ${event.object.deployment.version} succeeded`);
      // TODO: Post to Slack, update a status page, etc.
      break;

    case 'alert.deployment.failed':
      console.log(`Deployment ${event.object.deployment.version} failed:`, event.object.error.message);
      // TODO: Notify the author, open a ticket, etc.
      break;

    case 'alert.error':
      console.log(`Error group alert (${event.object.classification}):`, event.object.error.message);
      // TODO: Create an issue for the new error group or regression
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
