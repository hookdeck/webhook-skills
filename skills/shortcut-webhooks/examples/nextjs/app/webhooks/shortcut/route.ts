import { NextRequest, NextResponse } from 'next/server';
import { verifyShortcutWebhook } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  // Read the raw body as text: the signature covers the exact bytes received
  const rawBody = await request.text();
  const signature = request.headers.get('payload-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing Payload-Signature header' }, { status: 400 });
  }

  if (!verifyShortcutWebhook(rawBody, signature, process.env.SHORTCUT_WEBHOOK_SECRET)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload only after verification
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.log(`Received Shortcut event ${payload.id} (member: ${payload.member_id})`);

  // One event can carry several actions; dispatch on entity_type + action
  for (const item of payload.actions ?? []) {
    switch (`${item.entity_type} ${item.action}`) {
      case 'story create':
        console.log(`Story created: ${item.name} (${item.id})`);
        // TODO: Post to Slack, create a branch, etc.
        break;

      case 'story update':
        console.log(`Story updated: ${item.name} (${item.id})`, Object.keys(item.changes ?? {}));
        // TODO: React to workflow_state_id, owner_ids, estimate changes, etc.
        break;

      case 'epic create':
        console.log(`Epic created: ${item.name} (${item.id})`);
        // TODO: Notify stakeholders, etc.
        break;

      case 'epic update':
        console.log(`Epic updated: ${item.name} (${item.id})`);
        // TODO: Sync epic status, notify stakeholders, etc.
        break;

      default:
        // Deletes, comments and tasks also fire, but Shortcut doesn't document their
        // strings. Log what arrives and acknowledge it before you write a case for it.
        console.log(`Unhandled action: ${item.entity_type} ${item.action}`);
    }
  }

  return NextResponse.json({ received: true });
}
