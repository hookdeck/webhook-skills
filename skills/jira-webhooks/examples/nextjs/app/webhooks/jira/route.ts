// Generated with: jira-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify Jira webhook signature.
 *
 * Jira Cloud signs the raw body with HMAC-SHA256 keyed on the webhook secret and
 * sends it in the X-Hub-Signature header as `sha256=<hex>` (WebSub format).
 */
function verifyJiraWebhook(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  // Split the WebSub `method=signature` header (e.g. `sha256=<hex>`)
  const [method, sig] = (signatureHeader || '').split('=');
  if (method !== 'sha256' || !sig) {
    return false;
  }

  // Compute the expected signature over the raw body
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; guards against buffer length mismatch
  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Get the raw body for signature verification (do not parse before verifying)
  const body = await request.text();
  const signature = request.headers.get('x-hub-signature');
  const deliveryId = request.headers.get('x-atlassian-webhook-identifier');

  // Verify webhook signature before doing anything else
  if (!verifyJiraWebhook(body, signature, process.env.JIRA_WEBHOOK_SECRET!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse the payload after verification. Jira has no event-type header —
  // the event name is in the `webhookEvent` field of the body.
  const payload = JSON.parse(body);
  const event = payload.webhookEvent;
  const issue = payload.issue;

  console.log(`Received ${event} event (delivery: ${deliveryId})`);

  // Handle the event based on its `webhookEvent` type
  switch (event) {
    case 'jira:issue_created':
      console.log(`Issue created ${issue.key}: ${issue.fields.summary}`);
      // TODO: Sync to external system, auto-assign, notify, etc.
      break;

    case 'jira:issue_updated':
      console.log(`Issue updated ${issue.key}:`, payload.changelog?.items);
      // TODO: Track status changes, trigger automations, etc.
      break;

    case 'jira:issue_deleted':
      console.log(`Issue deleted ${issue.key}`);
      // TODO: Clean up mirrored records, etc.
      break;

    case 'comment_created':
      console.log(`Comment on ${issue.key} by ${payload.comment.author.displayName}`);
      // TODO: ChatOps, notifications, command parsing, etc.
      break;

    case 'comment_updated':
      console.log(`Comment updated on ${issue.key}`);
      // TODO: Audit trails, re-processing, etc.
      break;

    case 'comment_deleted':
      console.log(`Comment deleted on ${issue.key}`);
      // TODO: Audit trails, etc.
      break;

    case 'worklog_created':
      console.log(`Worklog logged on ${issue.key}`);
      // TODO: Time-tracking, billing integrations, etc.
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }

  // Return 200 to acknowledge receipt
  return NextResponse.json({ received: true });
}
