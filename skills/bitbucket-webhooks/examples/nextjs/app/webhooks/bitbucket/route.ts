// Generated with: bitbucket-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify Bitbucket webhook signature.
 * Header format: sha256=<hex>. HMAC-SHA256 hex over the raw body.
 */
export function verifyBitbucketWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) {
    return false;
  }

  // Split on "=" to separate method and signature.
  const [algo, signature] = signatureHeader.split('=');
  if (algo !== 'sha256' || !signature) {
    return false;
  }

  // Compute expected signature over the raw body
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
  const signature = request.headers.get('x-hub-signature');
  const event = request.headers.get('x-event-key');
  const requestUuid = request.headers.get('x-request-uuid');

  // Verify webhook signature
  if (!verifyBitbucketWebhook(body, signature, process.env.BITBUCKET_WEBHOOK_SECRET!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse the payload after verification
  const payload = JSON.parse(body);

  console.log(`Received ${event} event (uuid: ${requestUuid})`);

  // Handle the event based on the X-Event-Key
  switch (event) {
    case 'repo:push': {
      const change = payload.push?.changes?.[0];
      const name = change?.new?.name || change?.old?.name;
      console.log(`Push to ${name}:`, change?.commits?.[0]?.message);
      // TODO: Trigger CI/CD, run tests, deploy, etc.
      break;
    }

    case 'pullrequest:created':
      console.log(`PR #${payload.pullrequest.id} created:`, payload.pullrequest.title);
      // TODO: Assign reviewers, run checks, etc.
      break;

    case 'pullrequest:updated':
      console.log(`PR #${payload.pullrequest.id} updated:`, payload.pullrequest.title);
      // TODO: Re-run checks, notify reviewers, etc.
      break;

    case 'pullrequest:approved':
      console.log(`PR #${payload.pullrequest.id} approved by ${payload.approval?.user?.display_name}`);
      // TODO: Merge gating, notifications, etc.
      break;

    case 'pullrequest:fulfilled':
      console.log(`PR #${payload.pullrequest.id} merged:`, payload.pullrequest.title);
      // TODO: Deploy, notify, close linked issues, etc.
      break;

    case 'pullrequest:rejected':
      console.log(`PR #${payload.pullrequest.id} declined:`, payload.pullrequest.title);
      // TODO: Cleanup, notify author, etc.
      break;

    case 'pullrequest:comment_created':
      console.log(`Comment on PR #${payload.pullrequest.id}:`, payload.comment?.content?.raw);
      // TODO: Bot responses, command parsing, etc.
      break;

    case 'issue:created':
      console.log(`Issue #${payload.issue.id} created:`, payload.issue.title);
      // TODO: Triage, label, notify, etc.
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }

  // Return 200 to acknowledge receipt
  return NextResponse.json({ received: true });
}
