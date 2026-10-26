// Generated with: learnupon-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyLearnuponSignature, seenWebhookIds } from '../../../lib/verify-learnupon';

type LearnuponItem = Record<string, any>;

function handleEvent(type: string, item: LearnuponItem): void {
  switch (type) {
    case 'user_created':
      console.log(`User created: ${item.user?.userId} (${item.user?.email})`);
      // TODO: provision the user in your system
      break;

    case 'user_updated':
      console.log(`User updated: ${item.user?.userId}`);
      // TODO: sync the profile
      break;

    case 'course_cloning_complete':
    case 'course_updated':
      console.log(`Course event: ${type}`);
      // TODO: refresh your course catalog
      break;

    case 'course_completion':
      console.log(`Course completed: course ${item.courseId} by user ${item.user?.userId} (${item.enrollmentStatus})`);
      // TODO: issue a certificate or update HR records
      break;

    case 'module_complete':
      console.log(`Module completed: ${type}`);
      // TODO: track progress
      break;

    case 'purchase_completion':
      console.log(`Purchase completed: order ${item.orderId} (${item.amountPaid} ${item.currency})`);
      // TODO: fulfil the order
      break;

    case 'badge_awarded':
    case 'badge_revoked':
      console.log(`Badge event: ${type}`);
      // TODO: update recognition feeds
      break;

    case 'course_enrollment':
      console.log(`Course enrollment: user ${item.user?.userId} on course ${item.courseId}`);
      // TODO: sync the roster
      break;

    case 'course_unenrollment':
      console.log(`Course unenrollment: user ${item.user?.userId} from course ${item.courseId}`);
      // TODO: remove from the roster
      break;

    case 'learning_path_enrollment':
    case 'learning_path_updated':
    case 'learning_path_completion':
      console.log(`Learning path event: ${type}`);
      // TODO: sync learning path state
      break;

    case 'event_session_creation':
    case 'event_session_updated':
    case 'event_session_canceled':
      console.log(`Live-learning session event: ${type} (session ${item.sessionId})`);
      // TODO: sync your calendar
      break;

    case 'learning_journey_enrollment':
    case 'learning_journey_completion':
    case 'learning_journey_blocked':
    case 'learning_journey_deleted':
    case 'learning_journey_archived':
      console.log(`Learning journey event: ${type}`);
      // TODO: sync learning journey state
      break;

    default:
      console.log(`Unhandled event: ${type}`);
  }
}

export async function POST(request: NextRequest) {
  // Verify the exact bytes received, before parsing anything.
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyLearnuponSignature(rawBody, request.headers.get('x-webhook-signature'))) {
    return NextResponse.json({ error: 'Invalid or missing signature' }, { status: 401 });
  }

  let payload: { data?: unknown };
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const type = request.headers.get('x-webhook-type');
  if (!type || !payload || !Array.isArray(payload.data)) {
    return NextResponse.json({ error: 'Expected {"data": [...]} and an X-Webhook-Type header' }, { status: 400 });
  }

  // LearnUpon resends failed webhooks, so dedupe on X-Webhook-ID.
  const webhookId = request.headers.get('x-webhook-id');
  if (webhookId && seenWebhookIds.has(webhookId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Up to 10 events of one type per request.
    for (const item of payload.data as LearnuponItem[]) handleEvent(type, item || {});
  } catch (err) {
    console.error('Error handling LearnUpon webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  if (webhookId) seenWebhookIds.add(webhookId);
  return NextResponse.json({ received: true });
}
