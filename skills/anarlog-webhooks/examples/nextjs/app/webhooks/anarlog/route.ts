// Generated with: anarlog-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyAnarlogWebhook } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  // Raw body as text: the signature covers the exact bytes Anarlog sent
  const body = await request.text();
  const signature = request.headers.get('x-anarlog-signature');

  if (!verifyAnarlogWebhook(body, signature, process.env.ANARLOG_WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse the payload only after verification
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const event = payload && typeof payload === 'object' ? payload.event : undefined;
  // Use payload.id (or the x-anarlog-delivery header) to dedupe retries
  switch (event) {
    case 'meeting.completed': {
      const meeting = payload.data?.meeting;
      console.log(`Meeting completed: ${meeting?.title} (${meeting?.id})`);
      // TODO: Archive the transcript, create a CRM activity, notify a channel
      break;
    }

    case 'note.enhanced': {
      const meeting = payload.data?.meeting;
      const actionItems = meeting?.action_items ?? [];
      console.log(`Summary generated for ${meeting?.title}: ${actionItems.length} action items`);
      // TODO: Post the summary, create tasks from action items
      break;
    }

    case 'webhook.test':
      console.log('Received webhook.test from Anarlog');
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }

  // Return 200 quickly: deliveries time out after 10 seconds
  return NextResponse.json({ received: true });
}
