// Generated with: api-video-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiVideoSignature } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  // Raw bytes: the exact body is what api.video signed
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-api-video-signature');

  if (!verifyApiVideoSignature(rawBody, signature, process.env.API_VIDEO_WEBHOOK_SECRET)) {
    console.error('api.video signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after verification
  let event: { type?: string; videoId?: string; liveStreamId?: string; encoding?: string; quality?: string };
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (event === null || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // The event name is the body's `type` field (X-Api-Video-WebhookID is the subscription id)
  switch (event.type) {
    case 'video.source.recorded':
      console.log(`Source recorded for video ${event.videoId}`);
      // TODO: mark upload as received
      break;

    case 'video.encoding.quality.completed':
      console.log(`Video ${event.videoId} encoded: ${event.encoding} ${event.quality}`);
      // TODO: make the rendition available
      break;

    case 'live-stream.broadcast.started':
      console.log(`Live stream ${event.liveStreamId} started`);
      // TODO: notify viewers
      break;

    case 'live-stream.broadcast.ended':
      console.log(`Live stream ${event.liveStreamId} ended`);
      // TODO: finalize the recording
      break;

    case 'video.caption.generated':
      console.log(`Caption generated for video ${event.videoId}`);
      break;

    case 'video.summary.generated':
      console.log(`Summary generated for video ${event.videoId}`);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
