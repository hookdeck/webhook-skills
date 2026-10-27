// Generated with: magic-hour-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyMagicHourSignature } from '../../../lib/verify-magic-hour';

interface MagicHourEvent {
  type: string;
  payload?: {
    id?: string;
    downloads?: { url: string; expires_at?: string }[];
    error?: { code?: string; message?: string } | null;
  };
}

/**
 * Dispatch on the body's `type`. The payload matches GET /v1/{video,image,audio}-projects/:id.
 * Payloads carry no event ID: dedupe on `${payload.id}:${type}`.
 */
function handleEvent(event: MagicHourEvent): void {
  const { type } = event;
  const payload = event.payload ?? {};

  switch (type) {
    case 'video.started':
    case 'image.started':
    case 'audio.started':
      console.log(`${type}: job ${payload.id} is rendering`);
      break;

    case 'video.completed':
    case 'image.completed':
    case 'audio.completed':
      console.log(`${type}: job ${payload.id} complete`);
      // Download URLs expire: save the files from payload.downloads[].url promptly
      for (const download of payload.downloads ?? []) {
        console.log(`  download: ${download.url} (expires ${download.expires_at})`);
      }
      break;

    case 'video.errored':
    case 'image.errored':
    case 'audio.errored':
      console.log(`${type}: job ${payload.id} failed: ${payload.error?.code} ${payload.error?.message}`);
      break;

    default:
      console.log(`Unhandled event type: ${type}`);
  }
}

export async function POST(request: NextRequest) {
  // Raw bytes, exactly as received: never parse before verifying.
  const rawBody = Buffer.from(await request.arrayBuffer());

  const result = verifyMagicHourSignature(rawBody, request.headers);
  if (!result.valid) {
    console.error(`Magic Hour webhook rejected: ${result.error}`);
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (
    !event ||
    typeof event !== 'object' ||
    Array.isArray(event) ||
    typeof (event as MagicHourEvent).type !== 'string'
  ) {
    return NextResponse.json({ error: 'Expected an object with a string "type"' }, { status: 400 });
  }

  try {
    handleEvent(event as MagicHourEvent);
  } catch (err) {
    console.error('Error handling Magic Hour event:', err);
    // A non-2xx makes Magic Hour retry (1, 2, 4, ... minutes, up to 24 hours).
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
