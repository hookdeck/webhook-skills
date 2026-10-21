// Generated with: tailscale-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyTailscaleWebhook } from '../../../lib/tailscale';

interface TailscaleEvent {
  timestamp: string;
  version: number;
  type: string;
  tailnet: string;
  message: string;
  data: Record<string, string> | null;
}

export async function POST(request: NextRequest) {
  // Read the raw body BEFORE parsing - the signature is over the exact bytes.
  const rawBody = await request.text();
  const header = request.headers.get('tailscale-webhook-signature');
  const secret = process.env.TAILSCALE_WEBHOOK_SECRET;

  if (!header) {
    return NextResponse.json({ error: 'Missing Tailscale-Webhook-Signature header' }, { status: 400 });
  }
  if (!secret) {
    console.error('TAILSCALE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }
  if (!verifyTailscaleWebhook(rawBody, header, secret)) {
    console.error('Tailscale webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after verification. The root of the payload is an array of events.
  let events: TailscaleEvent[];
  try {
    events = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!Array.isArray(events)) {
    return NextResponse.json({ error: 'Expected an array of events' }, { status: 400 });
  }

  for (const event of events) {
    const { type, tailnet, message, data } = event;
    switch (type) {
      case 'nodeCreated':
        console.log(`Node created in ${tailnet}: ${data?.deviceName} (${data?.nodeID})`);
        break;
      case 'nodeNeedsApproval':
        console.log(`Node needs approval: ${data?.deviceName}`);
        break;
      case 'nodeApproved':
        console.log(`Node approved: ${data?.deviceName}`);
        break;
      case 'nodeKeyExpiringInOneDay':
        console.log(`Node key expiring within a day: ${data?.deviceName}`);
        break;
      case 'nodeDeleted':
        console.log(`Node deleted: ${data?.deviceName}`);
        break;
      case 'policyUpdate':
        console.log(`Policy file updated by ${data?.actor}`);
        break;
      case 'userCreated':
        console.log(`User created: ${data?.user ?? message}`);
        break;
      case 'test':
        console.log('Received Tailscale test event');
        break;
      default:
        console.log(`Unhandled event type: ${type}`);
    }
    // TODO: persist / forward. Events have no id: use type + timestamp + data.nodeID
    // as an idempotency key.
  }

  // Always 2XX unless there is a transient failure, otherwise Tailscale retries.
  return NextResponse.json({ received: true });
}
