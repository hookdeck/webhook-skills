import { NextRequest, NextResponse } from 'next/server';
import { verifyForgejoWebhook } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  // Raw bytes for any content type; never decode and re-encode before verifying
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-forgejo-signature');
  // X-Forgejo-Event-Type is the exact event type; X-Forgejo-Event is the coarser group
  const event = request.headers.get('x-forgejo-event-type') || request.headers.get('x-forgejo-event');
  const deliveryId = request.headers.get('x-forgejo-delivery');

  if (!verifyForgejoWebhook(rawBody, signature, process.env.FORGEJO_WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after verification
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  if (payload === null || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  const action = payload.action;

  console.log(`Received ${event} event (delivery: ${deliveryId})`);

  switch (event) {
    case 'push':
      console.log(`Push to ${payload.ref} by ${payload.pusher?.login}:`, payload.commits?.[0]?.message);
      // TODO: Trigger CI/CD, run tests, deploy, etc.
      break;

    case 'pull_request':
      console.log(`PR #${payload.number} ${action}:`, payload.pull_request?.title);
      // TODO: Run checks, notify reviewers, etc.
      break;

    case 'issues':
      console.log(`Issue #${payload.issue?.number} ${action}:`, payload.issue?.title);
      // TODO: Triage, label, notify, etc.
      break;

    case 'issue_comment':
    case 'pull_request_comment':
      console.log(`Comment on #${payload.issue?.number} by ${payload.comment?.user?.login}`);
      // TODO: Bot commands, notifications, etc.
      break;

    case 'create':
      console.log(`Created ${payload.ref_type}:`, payload.ref);
      // TODO: Environment setup, etc.
      break;

    case 'delete':
      console.log(`Deleted ${payload.ref_type}:`, payload.ref);
      // TODO: Cleanup, archive, etc.
      break;

    case 'release':
      console.log(`Release ${action}:`, payload.release?.tag_name);
      // TODO: Deploy, notify, update changelog, etc.
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }

  return NextResponse.json({ received: true });
}
