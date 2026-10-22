import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify Gitea webhook signature (X-Gitea-Signature: bare hex HMAC-SHA256)
 */
function verifyGiteaWebhook(rawBody: string, signature: string | null, secret: string | undefined): boolean {
  // Gitea sends the header with an empty value when no secret is configured
  if (!signature || !secret) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // request.text() returns the raw body for any content type
  const body = await request.text();
  const signature = request.headers.get('x-gitea-signature');
  const event = request.headers.get('x-gitea-event');
  const deliveryId = request.headers.get('x-gitea-delivery');

  if (!verifyGiteaWebhook(body, signature, process.env.GITEA_WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse after verification: JSON, or form-encoded with JSON in `payload`
  let payload;
  try {
    const contentType = request.headers.get('content-type') || '';
    const json = contentType.includes('application/x-www-form-urlencoded')
      ? new URLSearchParams(body).get('payload')
      : body;
    payload = JSON.parse(json as string);
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  const action = payload.action;

  console.log(`Received ${event} event (delivery: ${deliveryId})`);

  switch (event) {
    case 'push':
      console.log(`Push to ${payload.ref}:`, payload.head_commit?.message);
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
