// Generated with: clickup-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import crypto from 'crypto';

interface ClickUpHistoryItem {
  id: string;
  field?: string;
  before?: { status?: string } | null;
  after?: { status?: string } | null;
}

interface ClickUpWebhookPayload {
  event: string;
  webhook_id: string;
  history_items?: ClickUpHistoryItem[];
  task_id?: string;
  list_id?: string;
  goal_id?: string;
  key_result_id?: string;
}

/**
 * Verify a ClickUp webhook signature.
 * ClickUp sends hex(HMAC-SHA256(webhook.secret, rawBody)) in the X-Signature header.
 */
function verifyClickUpWebhook(
  rawBody: string,
  signature: string | null,
  secret: string | undefined
): boolean {
  if (!signature || !secret) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; throws on length mismatch, which means invalid
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature.toLowerCase()),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  // Read the raw body before parsing - the signature covers these exact bytes
  const body = await request.text();
  const signature = request.headers.get('x-signature');

  // Return 400, not 401: ClickUp suspends a webhook immediately on a 401 response
  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Signature header' }, { status: 400 });
  }

  if (!verifyClickUpWebhook(body, signature, process.env.CLICKUP_WEBHOOK_SECRET)) {
    console.error('ClickUp webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload only after verification
  let payload: ClickUpWebhookPayload;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { event, webhook_id: webhookId } = payload;
  const historyItems = payload.history_items ?? [];

  // ClickUp recommends {webhook_id}:{history_item_id} as the idempotency key
  const idempotencyKeys = historyItems.map((item) => `${webhookId}:${item.id}`);
  console.log(`Received ${event} (webhook ${webhookId})`, idempotencyKeys);

  // The event name is in the body; ClickUp sends no event header
  switch (event) {
    case 'taskCreated':
      console.log(`Task created: ${payload.task_id}`);
      // TODO: Sync the new task to your system
      break;

    case 'taskUpdated':
      console.log(`Task updated: ${payload.task_id}`);
      // TODO: Fetch the task from the API or apply history_items changes
      break;

    case 'taskDeleted':
      console.log(`Task deleted: ${payload.task_id}`);
      // TODO: Remove mirrored records
      break;

    case 'taskStatusUpdated': {
      const statusItem = historyItems.find((item) => item.field === 'status');
      console.log(
        `Task ${payload.task_id} status: ${statusItem?.before?.status} -> ${statusItem?.after?.status}`
      );
      // TODO: Trigger workflow automation
      break;
    }

    case 'taskAssigneeUpdated':
      console.log(`Task assignee updated: ${payload.task_id}`);
      // TODO: Notify the new assignee
      break;

    case 'taskCommentPosted':
      console.log(`Comment posted on task: ${payload.task_id}`);
      // TODO: Forward the comment to chat
      break;

    case 'listCreated':
    case 'listUpdated':
    case 'listDeleted':
      console.log(`${event}: List ${payload.list_id}`);
      break;

    case 'goalCreated':
    case 'goalUpdated':
    case 'goalDeleted':
      console.log(`${event}: Goal ${payload.goal_id}`);
      break;

    case 'keyResultCreated':
    case 'keyResultUpdated':
    case 'keyResultDeleted':
      console.log(`${event}: Target ${payload.key_result_id}`);
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }

  // Respond quickly: ClickUp treats responses slower than 7 seconds as failures
  return NextResponse.json({ received: true });
}
