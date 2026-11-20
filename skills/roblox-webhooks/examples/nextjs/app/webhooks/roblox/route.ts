// Generated with: roblox-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import { verifyRobloxSignature, toleranceSeconds, parseEventTime } from '../../../lib/verify-roblox';
import { handleNotification, seenNotificationIds, type RobloxNotification } from '../../../lib/notifications';

// node:crypto needs the Node.js runtime.
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const secret = process.env.ROBLOX_WEBHOOK_SECRET;
  if (!secret) {
    console.error('ROBLOX_WEBHOOK_SECRET is not set: rejecting request');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw bytes: the HMAC covers the exact body. Don't call request.json() first.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const result = verifyRobloxSignature(rawBody, request.headers.get('roblox-signature'), secret, {
    tolerance: toleranceSeconds(),
  });
  if (!result.valid) {
    if (result.reason === 'missing_v1') {
      console.error('roblox-signature has no v1: set a secret on this webhook in the Creator Dashboard');
    }
    return NextResponse.json({ error: 'Invalid signature', reason: result.reason }, { status: 401 });
  }

  let notification: RobloxNotification;
  try {
    notification = JSON.parse(rawBody.toString('utf8')) as RobloxNotification;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!notification || typeof notification.EventType !== 'string') {
    return NextResponse.json({ error: 'Missing EventType' }, { status: 400 });
  }

  const { NotificationId: notificationId, EventType: eventType } = notification;
  if (notificationId && seenNotificationIds.has(notificationId)) {
    return NextResponse.json({ received: true, duplicate: true, notificationId, eventType });
  }

  const eventTime = parseEventTime(notification.EventTime);
  console.log(`Roblox ${eventType} ${notificationId} at ${eventTime ? eventTime.toISOString() : notification.EventTime}`);

  const action = handleNotification(notification);
  if (notificationId) seenNotificationIds.add(notificationId);

  return NextResponse.json({ received: true, notificationId, eventType, action });
}
