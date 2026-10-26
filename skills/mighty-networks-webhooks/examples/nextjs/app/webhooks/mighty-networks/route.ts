// Generated with: mighty-networks-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { normalizeEventType, verifyMightyNetworksRequest } from '../../../lib/verify-mighty-networks';

// Retries redeliver the same event_id. Use a durable store (Redis, a DB unique key) in production.
const seenEventIds = new Set<string>();

type Payload = Record<string, any>;

function handleEvent(eventType: string, payload: Payload): void {
  switch (eventType) {
    case 'MemberJoined':
      console.log(`Member joined space ${payload.space_id}`);
      // TODO: welcome the member, sync to your CRM (payload.member)
      break;

    case 'MemberLeft':
      console.log(`Member left space ${payload.space_id}`);
      // TODO: record churn (payload.member, payload.reason)
      break;

    case 'MemberPurchased':
      console.log('Member purchased a plan');
      // TODO: grant access (payload.member, payload.plan, payload.purchase)
      break;

    case 'MemberPurchaseRequested':
      console.log('Member requested a purchase');
      // TODO: approve or follow up (payload.member_email, payload.plan_id)
      break;

    case 'MemberSubscriptionRenewed':
      console.log('Subscription renewed');
      // TODO: extend access (payload.member, payload.subscription)
      break;

    case 'MemberSubscriptionCanceled':
      console.log('Subscription canceled');
      // TODO: start a win-back flow (payload.member, payload.subscription)
      break;

    case 'MemberPlanChanged':
      console.log('Member changed plan');
      // TODO: adjust entitlements (payload.plan)
      break;

    case 'MemberRemovedFromPlan':
      console.log('Member removed from plan');
      // TODO: revoke access
      break;

    case 'PostCreated':
      console.log(`Post created: ${payload.title}`);
      // TODO: moderate or cross-post (payload.id, payload.space_id)
      break;

    case 'PostUpdated':
      console.log(`Post updated: ${payload.title}`);
      // TODO: re-sync the post
      break;

    case 'CommentCreated':
      console.log(`Comment created on ${payload.targetable_type} ${payload.targetable_id}`);
      // TODO: notify (payload.text, payload.author_id)
      break;

    case 'RsvpCreated':
      console.log(`RSVP created: ${payload.status}`);
      // TODO: update the attendee list (payload.event, payload.member)
      break;

    case 'EventCreated':
      console.log(`Event created: ${payload.title}`);
      // TODO: add to your calendar (payload.starts_at)
      break;

    case 'EventCanceled':
      console.log(`Event canceled: ${payload.title}`);
      // TODO: notify attendees
      break;

    case 'ReportedContentCreated':
      console.log('Content reported');
      // TODO: queue for moderation (payload.reported_content)
      break;

    default:
      console.log(`Unhandled event: ${eventType}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyMightyNetworksRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Authorization Bearer key' }, { status: 401 });
  }

  let body: unknown;
  try {
    // Read as text so any content type is accepted.
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  const { event_id: eventId, event_type: eventType, payload } = body as Payload;
  if (typeof eventId === 'string' && seenEventIds.has(eventId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    handleEvent(
      normalizeEventType(eventType),
      payload && typeof payload === 'object' ? (payload as Payload) : {}
    );
  } catch (err) {
    console.error('Error handling Mighty Networks event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  if (typeof eventId === 'string') seenEventIds.add(eventId); // after success, so a failed event is retried
  return NextResponse.json({ received: true });
}
