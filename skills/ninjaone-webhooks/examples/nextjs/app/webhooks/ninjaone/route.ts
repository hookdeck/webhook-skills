// Generated with: ninjaone-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { dedupeKey, verifyNinjaOneSecret, type NinjaOneActivity } from '../../../lib/ninjaone';

// Use a database or cache in production; a Set is enough to show the idea.
const processed = new Set<string>();

function handleActivity(activity: NinjaOneActivity) {
  const { activityType, statusCode } = activity;
  switch (activityType) {
    case 'CONDITION':
      // A monitoring condition fired (TRIGGERED) or cleared (RESET)
      if (statusCode === 'TRIGGERED') {
        console.log(
          `Condition triggered on device ${activity.deviceId}: ${activity.message} (severity ${activity.severity})`
        );
      } else if (statusCode === 'RESET') {
        console.log(`Condition reset on device ${activity.deviceId}: ${activity.message}`);
      } else {
        console.log(`Condition ${statusCode} on device ${activity.deviceId}`);
      }
      break;
    case 'ACTION':
    case 'ACTIONSET':
      // Scripts and automations: STARTED, COMPLETED, CANCELLED, ...
      console.log(`${activityType} ${statusCode} on device ${activity.deviceId}: ${activity.subject}`);
      break;
    default:
      console.log(`Unhandled activity ${activityType}/${statusCode}`);
  }
  // TODO: open a ticket, page on-call, sync your CMDB, etc.
}

export async function POST(request: NextRequest) {
  const secret = process.env.NINJAONE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('NINJAONE_WEBHOOK_SECRET is not set; rejecting webhook');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Authenticate before reading the body
  if (!verifyNinjaOneSecret(request.headers.get('x-webhook-secret'), secret)) {
    return NextResponse.json(
      { error: 'Invalid or missing X-Webhook-Secret header' },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const activity = body as NinjaOneActivity;
  if (!activity || typeof activity !== 'object' || Array.isArray(activity) || !activity.activityType) {
    return NextResponse.json(
      { error: 'Expected an activity object with activityType' },
      { status: 400 }
    );
  }

  const key = dedupeKey(activity);
  if (key && processed.has(key)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    handleActivity(activity);
  } catch (err) {
    console.error('Error handling NinjaOne activity:', err);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  if (key) processed.add(key);
  return NextResponse.json({ received: true });
}
