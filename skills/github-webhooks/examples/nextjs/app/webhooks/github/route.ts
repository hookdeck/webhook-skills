import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify GitHub webhook signature
 */
function verifyGitHubWebhook(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) {
    return false;
  }

  // Extract the signature from the header (format: sha256=<hex>)
  const signature = signatureHeader.replace('sha256=', '');

  // Compute expected signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Get the raw body for signature verification
  const body = await request.text();
  const signature = request.headers.get('x-hub-signature-256');
  const event = request.headers.get('x-github-event');
  const deliveryId = request.headers.get('x-github-delivery');

  // Verify webhook signature
  if (!verifyGitHubWebhook(body, signature, process.env.GITHUB_WEBHOOK_SECRET!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 401 }
    );
  }

  // Parse the payload after verification
  const payload = JSON.parse(body);
  const action = payload.action;

  console.log(`Received ${event} event (delivery: ${deliveryId})`);

  // Handle the event based on type
  switch (event) {
    case 'ping':
      console.log('Ping received:', payload.zen);
      break;

    case 'push':
      console.log(`Push to ${payload.ref}:`, payload.head_commit?.message);
      // TODO: Trigger CI/CD, run tests, deploy, etc.
      break;

    case 'pull_request':
      console.log(`PR #${payload.number} ${action}:`, payload.pull_request.title);
      // TODO: Run checks, notify reviewers, auto-merge, etc.
      break;

    case 'issues':
      console.log(`Issue #${payload.issue.number} ${action}:`, payload.issue.title);
      // TODO: Triage, label, notify, etc.
      break;

    case 'issue_comment':
      console.log(`Comment on #${payload.issue.number} by ${payload.comment.user.login}`);
      // TODO: Bot responses, command parsing, etc.
      break;

    case 'release':
      console.log(`Release ${action}:`, payload.release.tag_name);
      // TODO: Deploy, notify, update changelog, etc.
      break;

    case 'workflow_run':
      console.log(`Workflow "${payload.workflow_run.name}" ${payload.workflow_run.conclusion}`);
      // TODO: Post-CI automation, notifications, etc.
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }

  // Return 200 to acknowledge receipt
  return NextResponse.json({ received: true });
}
