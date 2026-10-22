import { NextRequest, NextResponse } from 'next/server';
import { verifyHelpScoutWebhook } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  // Read the raw body for signature verification (do not use request.json())
  const rawBody = await request.text();
  const signature = request.headers.get('x-helpscout-signature');
  const event = request.headers.get('x-helpscout-event');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing signature header' },
      { status: 400 }
    );
  }

  if (!verifyHelpScoutWebhook(rawBody, signature, process.env.HELPSCOUT_WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    // Never return 410 here: Help Scout deletes the webhook on 410
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload only after verification
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.log(`Received ${event} webhook`);

  // The event name is in the X-HelpScout-Event header, not the body
  switch (event) {
    case 'convo.created':
      console.log('Conversation created:', payload.id, payload.subject);
      // TODO: Create a ticket in another system, alert a channel, etc.
      break;

    case 'convo.assigned':
      console.log('Conversation assigned:', payload.id);
      // TODO: Notify the assignee, update routing, etc.
      break;

    case 'convo.status':
      console.log('Conversation status updated:', payload.id, payload.status);
      // TODO: Sync status, trigger follow-up on close, etc.
      break;

    case 'convo.customer.reply.created':
      console.log('Customer replied on conversation:', payload.id);
      // TODO: Escalate, reopen external tasks, etc.
      break;

    case 'convo.agent.reply.created':
      console.log('Agent replied on conversation:', payload.id);
      // TODO: Record response-time metrics, etc.
      break;

    case 'customer.created':
      console.log('Customer created:', payload.id);
      // TODO: Sync to CRM, etc.
      break;

    case 'customer.updated':
      console.log('Customer updated:', payload.id);
      // TODO: Keep profiles in sync, etc.
      break;

    case 'satisfaction.ratings':
      console.log('Satisfaction rating received:', payload.id);
      // TODO: Report CSAT, alert on low scores, etc.
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }

  // Any 2xx acknowledges receipt
  return NextResponse.json({ received: true });
}
