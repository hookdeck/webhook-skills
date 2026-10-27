// Generated with: wistia-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

// X-Wistia-Signature is the bare hex HMAC-SHA256 of the raw body: exactly 64 hex characters
const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

function verifyWistiaSignature(rawBody: Buffer, signature: string | null, secret: string | undefined): boolean {
  if (!secret || !signature || !HEX_SHA256.test(signature)) return false;

  // Key = the secret's UTF-8 bytes; message = the raw body bytes, untouched
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // safe: format validated above
  return received.length === expected.length && timingSafeEqual(received, expected);
}

interface WistiaEvent {
  uuid: string;
  type: string;
  generated_at?: string;
  payload: Record<string, any>;
}

// Wistia delivers at least once, so remember event uuids we've handled.
// In production use a database or Redis with a TTL instead of process memory.
const seenEventUuids = new Set<string>();

function handleEvent(event: WistiaEvent): void {
  const { type, payload } = event;
  switch (type) {
    case 'media.created':
      console.log('Media created:', payload.media?.id);
      // TODO: Record the media as uploaded
      break;
    case 'media.processing':
      console.log('Media processing:', payload.media?.id);
      break;
    case 'media.ready':
      console.log('Media ready:', payload.media?.id);
      // TODO: Publish the video; it is ready for playback
      break;
    case 'media.failed':
      console.log('Media failed:', payload.media?.id);
      // TODO: Mark the media as failed and notify the uploader
      break;
    case 'media.updated':
      console.log('Media updated:', payload.media?.id, payload.previous_attributes);
      break;
    case 'media.transcript_updated':
      console.log('Transcript updated:', payload.media?.id, payload.transcript?.language_code);
      break;
    case 'media.transcript_failed':
      console.log('Transcript failed:', payload.media?.id, payload.transcript?.reason);
      break;
    case 'media.deleted':
      console.log('Media deleted:', payload.media?.id);
      // TODO: Remove the media from your catalog
      break;
    case 'media.translation_created':
      console.log('Translation created:', payload.media?.id);
      break;
    case 'media.localization_created':
      console.log('Localization created:', payload.localization?.hashed_id);
      break;
    case 'media.localization_failed':
      console.log('Localization failed:', payload.localization?.hashed_id);
      break;
    case 'viewing_session.play':
      console.log('Play:', payload.viewing_session?.id, payload.media?.id);
      break;
    case 'viewing_session.percent_watched':
      console.log('Percent watched:', payload.percent_watched, payload.media?.id);
      break;
    case 'viewing_session.turnstile.converted':
      console.log('Form converted:', payload.viewing_session?.id);
      // TODO: Send the lead to your CRM
      break;
    case 'viewing_session.call_to_action.converted':
      console.log('Call to action converted:', payload.viewing_session?.id);
      break;
    case 'viewing_session.annotation.converted':
      console.log('Annotation converted:', payload.viewing_session?.id);
      break;
    case 'live_event.registration':
      console.log('Live event registration:', payload.live_event?.id);
      // TODO: Add the registrant to your system
      break;
    default:
      console.log(`Unhandled event type: ${type}`);
  }
}

export async function POST(request: NextRequest) {
  // Raw bytes, exactly as received - never parse before verifying
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyWistiaSignature(rawBody, request.headers.get('x-wistia-signature'), process.env.WISTIA_WEBHOOK_SECRET)) {
    console.error('Wistia webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after the signature check
  let body: { events?: WistiaEvent[] };
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body || !Array.isArray(body.events)) {
    return NextResponse.json({ error: 'Missing events array' }, { status: 400 });
  }

  // One POST can batch several events; each has its own uuid
  for (const event of body.events) {
    if (!event || typeof event !== 'object') continue;
    if (seenEventUuids.has(event.uuid)) continue;
    seenEventUuids.add(event.uuid);
    handleEvent(event);
  }

  return NextResponse.json({ received: true });
}
