// Generated with: teamwork-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import crypto from 'crypto';

interface TeamworkWebhookPayload {
  eventCreator?: { id: number; firstName?: string; lastName?: string };
  // Delete events share the payload { id, projectId, eventCreator }
  id?: number;
  projectId?: number;
  task?: { id: number };
  project?: { id: number };
  comment?: { id: number };
  milestone?: { id: number };
  time?: { id: number };
}

/**
 * Verify a Teamwork (Projects, Version 2) webhook signature.
 * Teamwork sends hex(HMAC-SHA256(token, rawBody)) in the X-Projects-Signature header.
 */
function verifyTeamworkWebhook(
  rawBody: string,
  signature: string | null,
  token: string | undefined
): boolean {
  // Check for exactly 64 hex chars first: Buffer.from(x, 'hex') silently truncates invalid hex
  if (!signature || !token || !/^[0-9a-f]{64}$/i.test(signature)) {
    return false;
  }

  const expected = crypto.createHmac('sha256', token).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), expected);
}

export async function POST(request: Request) {
  // Read the raw body before parsing - the signature covers these exact bytes
  const body = await request.text();
  const signature = request.headers.get('x-projects-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing X-Projects-Signature header (use a Version 2 webhook with a token)' },
      { status: 401 }
    );
  }

  // Read the token per request so it can be rotated without a restart
  if (!verifyTeamworkWebhook(body, signature, process.env.TEAMWORK_WEBHOOK_TOKEN)) {
    console.error('Teamwork webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse the payload only after verification
  let payload: TeamworkWebhookPayload;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The event name is in the X-Projects-Event header, e.g. TASK.CREATED
  const event = request.headers.get('x-projects-event');
  console.log(`Received ${event}${payload.eventCreator ? ` from user ${payload.eventCreator.id}` : ''}`);

  switch (event) {
    case 'TASK.CREATED':
      console.log(`Task created: ${payload.task?.id}`);
      // TODO: Sync the new task to your system
      break;

    case 'TASK.UPDATED':
      console.log(`Task updated: ${payload.task?.id}`);
      // TODO: Apply the changes to your mirrored task
      break;

    case 'TASK.COMPLETED':
      console.log(`Task completed: ${payload.task?.id}`);
      // TODO: Trigger downstream automation
      break;

    case 'TASK.DELETED':
      console.log(`Task deleted: ${payload.id}`);
      // TODO: Remove mirrored records
      break;

    case 'PROJECT.CREATED':
      console.log(`Project created: ${payload.project?.id}`);
      // TODO: Provision resources for the project
      break;

    case 'COMMENT.CREATED':
      console.log(`Comment created: ${payload.comment?.id}`);
      // TODO: Forward the comment to chat
      break;

    case 'MILESTONE.COMPLETED':
      console.log(`Milestone completed: ${payload.milestone?.id}`);
      break;

    case 'TIME.CREATED':
      console.log(`Time logged: ${payload.time?.id}`);
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }

  // Respond quickly: Teamwork requires a 200 within 5 seconds
  return NextResponse.json({ received: true });
}
