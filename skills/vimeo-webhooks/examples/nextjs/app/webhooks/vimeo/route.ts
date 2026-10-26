// Generated with: vimeo-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Vimeo webhook signature.
 *
 * Vimeo has no webhook SDK, so we verify manually. When the webhook has a
 * `secret`, Vimeo sends `X-Webhook-Signature` = lowercase hex HMAC-SHA256 of the
 * RAW request body keyed with that secret. Nothing else is signed.
 */
function verifyVimeo(rawBody: string, signature: string | null, secret: string): boolean {
  // Validate the format first: Buffer.from(x, 'hex') silently truncates bad hex.
  if (!secret || !signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  // Both sides are 64-char lowercase hex strings, so the buffers have equal length.
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature.toLowerCase())
  );
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.VIMEO_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('VIMEO_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the RAW body for signature verification (do not JSON.parse first).
  const rawBody = await request.text();

  const signature = request.headers.get('x-webhook-signature');
  if (!signature) {
    // Vimeo only signs webhooks that have a `secret` set via the API.
    return NextResponse.json({ error: 'Missing X-Webhook-Signature header' }, { status: 401 });
  }

  if (!verifyVimeo(rawBody, signature, webhookSecret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Signature verified - safe to parse.
  let event: { webhook_type?: string; data?: Record<string, string>; timestamp?: number };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The event name is the `webhook_type` field in the body.
  // Vimeo sends no delivery ID: dedupe on webhook_type + data URI + timestamp.
  const data = event.data ?? {};

  switch (event.webhook_type) {
    case 'video-created':
      console.log(`Video created: ${data.video_uri}`);
      // TODO: record the new video
      break;

    case 'video-deleted':
      console.log(`Video deleted: ${data.video_uri}`);
      // TODO: remove the video from your catalog
      break;

    case 'video-transcode-playable':
      console.log(`Video playable: ${data.video_uri}`);
      // TODO: allow playback
      break;

    case 'video-transcode-complete':
      console.log(`Video transcode complete: ${data.video_uri} (${data.version_uri})`);
      // TODO: mark processing done
      break;

    case 'video-upload-failed':
      console.log(`Video upload failed: ${data.video_uri} (${data.error_type})`);
      // TODO: notify the uploader
      break;

    case 'transcript-status-complete':
      console.log(`Transcript ${data.transcript_status}: ${data.video_uri}`);
      // TODO: fetch the transcript if completed
      break;

    case 'live-event-started':
      console.log(`Live event started: ${data.event_uri}`);
      // TODO: notify viewers
      break;

    case 'live-event-ended':
      console.log(`Live event ended: ${data.event_uri}`);
      // TODO: close out the stream
      break;

    default:
      console.log(`Unhandled event type: ${event.webhook_type}`);
  }

  // Return 200 to acknowledge receipt.
  return NextResponse.json({ received: true });
}
