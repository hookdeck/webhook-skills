// Generated with: texture-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyTextureSignature } from '../../../lib/verify-texture';

function handleEvent(event: Record<string, any>): void {
  switch (event.type) {
    case 'device.discovered':
      console.log(`Device discovered: ${event.deviceId}`);
      // TODO: register the device in your system
      break;

    case 'device.updated':
      console.log(`Device updated: ${event.deviceId}`);
      // TODO: sync device state
      break;

    case 'device.disconnected':
      console.log(`Device disconnected: ${event.deviceId}`);
      break;

    case 'command.succeeded':
      console.log(`Command succeeded for device ${event.deviceId}`);
      break;

    case 'command.failed':
      console.log(`Command failed for device ${event.deviceId}`);
      // TODO: retry or alert
      break;

    case 'command.overridden':
      console.log(`Command overridden for device ${event.deviceId}`);
      break;

    case 'customer.created':
      console.log('Customer created');
      break;

    case 'enrollment.approved':
      console.log('Enrollment approved');
      break;

    case 'site.created':
      console.log('Site created');
      break;

    default:
      console.log(`Unhandled Texture event type: ${event.type}`);
  }
}

export async function POST(request: NextRequest) {
  // Raw bytes, so the exact body is verified whatever the content type.
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (
    !verifyTextureSignature(
      rawBody,
      request.headers.get('texture-signature'),
      process.env.TEXTURE_WEBHOOK_SECRET
    )
  ) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  // Events can arrive out of order and be retried: dedupe on event.key before side effects.
  try {
    handleEvent(event as Record<string, any>);
  } catch (err) {
    console.error('Error handling Texture webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
