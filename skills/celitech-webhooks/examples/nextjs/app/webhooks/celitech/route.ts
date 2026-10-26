// Generated with: celitech-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { resolveSignatureHeaders } from '../../../lib/celitech';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.CELITECH_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CELITECH_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const sigHeaders = resolveSignatureHeaders(request.headers);
  if (!sigHeaders) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Celitech signed
  const rawBody = await request.text();

  try {
    // HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, entry.
    // The library also enforces a fixed 5-minute timestamp window; see
    // references/verification.md for a manual verifier without it.
    new Webhook(secret).verify(rawBody, sigHeaders);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Celitech webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The body is flat: `type` plus the event's fields (no `data` wrapper).
  // svix-id is stable across retries: use it to deduplicate.
  console.log(`Received Celitech webhook ${sigHeaders['svix-id']}: ${event.type}`);

  switch (event.type) {
    case 'consumption.threshold.reached':
      console.log(
        `Purchase ${event.purchaseId} at ${event.actualPercentage}% ` +
          `(threshold ${event.notificationPercentage}%, ${event.dataUsageRemainingInGB} of ${event.dataLimitInGB} GB left)`
      );
      break;
    case 'esim.downloaded':
      console.log('eSIM downloaded:', event.iccid);
      break;
    case 'esim.installed':
      console.log('eSIM installed:', event.iccid);
      break;
    case 'esim.enabled':
      console.log('eSIM enabled:', event.iccid);
      break;
    case 'esim.disabled':
      console.log('eSIM disabled:', event.iccid);
      break;
    case 'esim.deleted':
      console.log('eSIM deleted:', event.iccid);
      break;
    default:
      console.log('Unhandled event type:', event.type);
  }

  return NextResponse.json({ success: true, type: event.type });
}
