// Generated with: oh-dear-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyOhDearSignature } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  const secret = process.env.OH_DEAR_WEBHOOK_SECRET;
  if (!secret) {
    console.error('OH_DEAR_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes, exactly as received: never re-serialize before verifying
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyOhDearSignature(rawBody, request.headers.get('ohdear-signature'), secret)) {
    console.error('Oh Dear signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after the signature check
  let event: { type?: string; uuid?: string; [key: string]: any };
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Dispatch on the top-level `type` (nested objects have their own `type` keys).
  // `uuid` is stable across retries and manual resends: use it to deduplicate.
  const type = event.type ?? '';
  console.log(`Received ${type} (uuid: ${event.uuid})`);

  if (type === 'monitorAddedNotification') {
    console.log(`Monitor added: ${event.monitor?.url}`);
  } else if (/^(http|tcp|ping)UptimeCheckFailedNotification$/.test(type)) {
    console.log(`Uptime check failed: ${event.result_url}`);
  } else if (/^(http|tcp|ping)UptimeCheckRecoveredNotification$/.test(type)) {
    console.log(`Uptime check recovered: ${event.result_url}`);
  } else if (type === 'certificateExpiresSoonNotification') {
    console.log('Certificate expires soon');
  } else if (type === 'brokenLinksFoundNotification') {
    console.log('Broken links found');
  } else if (type === 'cronFailedNotification') {
    console.log('Scheduled task failed');
  } else {
    console.log(`Unhandled event type: ${type}`);
  }

  // Oh Dear only treats HTTP 200 as success (redirects fail)
  return NextResponse.json({ received: true }, { status: 200 });
}
