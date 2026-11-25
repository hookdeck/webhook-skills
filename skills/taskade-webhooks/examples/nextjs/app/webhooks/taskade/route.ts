// Generated with: taskade-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyTaskadeWebhook, taskadeEventType } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  // Raw bytes: the signature covers the exact bytes Taskade sent
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-taskade-signature-v2');
  const timestamp = request.headers.get('x-taskade-timestamp');

  if (!verifyTaskadeWebhook(rawBody, signature, timestamp, process.env.TASKADE_WEBHOOK_SECRET)) {
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

  // A copy of a delivery can arrive inside the 5-minute window and still pass.
  // Make these handlers idempotent, or record each delivery you process and skip a repeat.
  const event = taskadeEventType(payload);
  switch (event) {
    case 'task.due':
      console.log('Task due:', payload.id, payload.projectId);
      // Your code: send a reminder or escalate
      break;

    case 'task.assigned':
      console.log('Task assigned in project:', payload.projectId);
      // Your code: notify each assignee in payload.assignedNodes
      break;

    case 'comment.created':
      console.log('Comment on task:', payload.nodeId);
      // Your code: mirror the comment
      break;

    case 'project.created':
      console.log('Project created:', payload.projectId);
      break;

    case 'project.assigned':
      console.log('Project assigned:', payload.projectId);
      break;

    case 'project.joined':
      console.log('Project joined:', payload.projectId);
      break;

    default:
      console.log('Unrecognised Taskade delivery');
  }

  // Return 200 to acknowledge receipt
  return NextResponse.json({ received: true });
}
