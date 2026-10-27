// Generated with: featurebase-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { verifyFeaturebaseWebhook } from '../../../lib/verify';

interface FeaturebaseEvent {
  object: string; // "notification_event"
  id: string; // notif_..., the same on every retry
  topic: string; // e.g. "post.created"
  organizationId: string;
  webhookId: string;
  createdAt: string;
  data: { item?: Record<string, any>; changes?: { field: string; oldValue: unknown; newValue: unknown }[] };
}

// In-memory dedupe for the demo. Use Redis or your database in production.
const processedEventIds = new Set<string>();

function handleEvent(event: FeaturebaseEvent): void {
  const item = event.data?.item ?? {};

  switch (event.topic) {
    case 'post.created':
      console.log(`Request created: ${item.title} (${item.id})`);
      break;
    case 'post.updated': {
      const changes = event.data?.changes;
      const fields = (Array.isArray(changes) ? changes : []).map((c) => c?.field);
      console.log(`Request updated: ${item.id}, changed: ${fields.join(', ') || 'n/a'}`);
      break;
    }
    case 'post.voted':
      console.log(`Request ${item.postId} vote ${item.action} by ${item.voter?.name}`);
      break;
    case 'ticket.created':
      console.log(`Ticket created: #${item.ticketNumber} ${item.title}`);
      break;
    case 'comment.created':
      console.log(`Comment created: ${item.id} on ${item.postId ?? item.changelogId}`);
      break;
    case 'changelog.published':
      console.log(`Update published: ${item.title} (${item.locale})`);
      break;
    case 'conversation.user.created':
      console.log(`Conversation started: ${item.id} ${item.title}`);
      break;
    case 'conversation.admin.assigned':
      console.log(`Conversation assigned: ${item.id}`);
      break;
    case 'conversation.admin.closed':
      console.log(`Conversation closed: ${item.id}`);
      break;
    default:
      // post.deleted, ticket.updated, comment.updated, conversation.* and the rest.
      console.log(`Unhandled Featurebase topic: ${event.topic}`);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.FEATUREBASE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('FEATUREBASE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Exact bytes as received. Never parse before verifying.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const tolerance = Number(process.env.FEATUREBASE_WEBHOOK_TOLERANCE_SECONDS) || 0;
  const result = verifyFeaturebaseWebhook(
    rawBody,
    request.headers.get('x-webhook-signature'),
    request.headers.get('x-webhook-timestamp'),
    secret,
    tolerance
  );
  if (!result.valid) {
    console.error(`Featurebase signature verification failed: ${result.error}`);
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  let event: FeaturebaseEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (event === null || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  if (event.id && processedEventIds.has(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (event.id) processedEventIds.add(event.id);

  handleEvent(event);
  // Featurebase needs 200/201/202/204 within 5 seconds. Queue slow work.
  return NextResponse.json({ received: true });
}
