// Generated with: signal-sciences-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifySignalSciencesWebhook } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  // Raw body is required: the signature covers the exact bytes Fastly sent
  const body = await request.text();
  const signature = request.headers.get('x-sigsci-signature');

  if (!verifySignalSciencesWebhook(body, signature, process.env.SIGNAL_SCIENCES_SIGNING_KEY)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse after verification. The event name is the `type` field in the body.
  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.log(`Received ${event.type} event for ${event.workspaceId}`);

  switch (event.type) {
    case 'flag':
      console.log('IP flagged:', event.payload, event.link);
      // TODO: Alert, add to external blocklist, etc.
      break;

    case 'expireFlag':
      console.log('IP flag expired:', event.payload);
      // TODO: Remove from external blocklist
      break;

    case 'agentAlert':
      console.log('Agent alert:', event.payload);
      // TODO: Page on-call
      break;

    case 'loggingModeChanged':
      console.log('Agent mode changed:', event.payload);
      // TODO: Alert if protection was turned off
      break;

    case 'ruleCreated':
    case 'ruleUpdated':
    case 'ruleDeleted':
      console.log(`Request rule change (${event.type}):`, event.payload);
      // TODO: Record in audit log
      break;

    case 'listCreated':
    case 'listUpdated':
    case 'listDeleted':
      console.log(`List change (${event.type}):`, event.payload);
      break;

    default:
      console.log(`Unhandled event: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
