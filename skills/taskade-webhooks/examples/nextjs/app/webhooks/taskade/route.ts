// Generated with: taskade-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyTaskadeWebhook } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  // Raw bytes: the signature covers the exact bytes Taskade sent
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-taskade-signature');

  if (!verifyTaskadeWebhook(rawBody, signature, process.env.TASKADE_WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse the payload only after verification
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The docs don't say where a delivery names its event, so read it from the payload
  const event = payload && typeof payload === 'object' ? (payload.event ?? payload.type) : undefined;
  switch (event) {
    case 'task.due':
      console.log('Task due:', payload);
      // TODO: Send a reminder, escalate, etc.
      break;

    case 'task.assigned':
      console.log('Task assigned:', payload);
      // TODO: Notify the assignee
      break;

    case 'comment.created':
      console.log('Comment created:', payload);
      break;

    case 'project.created':
      console.log('Project created:', payload);
      break;

    default:
      console.log(`Unhandled event: ${event ?? 'unknown'}`);
  }

  // Return 200 to acknowledge receipt
  return NextResponse.json({ received: true });
}
