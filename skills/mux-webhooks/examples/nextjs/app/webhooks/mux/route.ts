// Generated with: mux-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import Mux from '@mux/ts';

// No API token is needed just to verify webhooks
const mux = new Mux();

export async function POST(request: NextRequest) {
  // Get the raw body for signature verification
  const body = await request.text();

  if (!request.headers.get('mux-signature')) {
    return NextResponse.json(
      { error: 'Missing mux-signature header' },
      { status: 400 }
    );
  }

  let event: Mux.Webhooks.UnwrapWebhookEvent;
  try {
    // Verify the mux-signature header (HMAC-SHA256 of "<t>.<raw body>",
    // 5-minute tolerance) and parse the JSON body in one step
    event = await mux.webhooks.unwrap(
      body,
      request.headers,
      process.env.MUX_WEBHOOK_SECRET
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Mux webhook verification failed:', message);
    return NextResponse.json(
      { error: `Webhook Error: ${message}` },
      { status: 400 }
    );
  }

  // Handle the event based on type
  switch (event.type) {
    case 'video.asset.created':
      console.log('Asset created:', event.data.id);
      // TODO: Record the asset and show it as processing
      break;

    case 'video.asset.ready':
      console.log('Asset ready:', event.data.id, event.data.playback_ids);
      // TODO: Store the playback ID and publish the video
      break;

    case 'video.asset.errored':
      console.log('Asset errored:', event.data.id, event.data.errors);
      // TODO: Mark the asset as failed and notify the uploader
      break;

    case 'video.asset.deleted':
      console.log('Asset deleted:', event.data.id);
      // TODO: Remove the asset from your catalog
      break;

    case 'video.asset.live_stream_completed':
      console.log('Live stream asset completed:', event.data.id);
      // TODO: Publish the recorded replay
      break;

    case 'video.upload.asset_created':
      console.log('Upload created asset:', event.data.id, event.data.asset_id);
      // TODO: Link the new asset to the user who uploaded it
      break;

    case 'video.live_stream.active':
      console.log('Live stream active:', event.data.id);
      // TODO: Show the stream as live
      break;

    case 'video.live_stream.idle':
      console.log('Live stream idle:', event.data.id);
      // TODO: Show the stream as ended
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  // Return 200 to acknowledge receipt
  return NextResponse.json({ received: true });
}
