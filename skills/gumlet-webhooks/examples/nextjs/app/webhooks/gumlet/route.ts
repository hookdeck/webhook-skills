// Generated with: gumlet-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyGumletRequest } from '../../../lib/verify-gumlet';

interface GumletPayload {
  type?: string;
  status?: string;
  asset_id?: string;
  live_asset_id?: string;
  recording_asset_id?: string;
  vod_collection_id?: string;
  [key: string]: unknown;
}

function handleEvent(payload: GumletPayload): void {
  const { type } = payload;

  switch (type) {
    case 'video.status.created':
    case 'video.status.stream_ready':
    case 'video.status.downloaded':
    case 'video.status.processed':
      console.log(`Video ${payload.status}: ${payload.asset_id}`);
      // Your code: update processing progress for payload.asset_id
      break;

    case 'video.status.ready':
      console.log(`Video ready: ${payload.asset_id}`);
      // Your code: store payload.output.playback_url and publish the video
      break;

    case 'video.status.errored':
      console.log(`Video errored: ${payload.asset_id}`);
      // Your code: alert and retry the upload
      break;

    case 'video.status.deleted':
      console.log(`Video deleted: ${payload.asset_id}`);
      // Your code: remove local records
      break;

    case 'video.status.repackaged':
      console.log(`Video repackaged: ${payload.asset_id}`);
      // Your code: refresh playback info
      break;

    case 'live.video.status.created':
    case 'live.video.status.preparing':
    case 'live.video.status.ready':
    case 'live.video.status.connected':
    case 'live.video.status.active':
    case 'live.video.status.disconnected':
      console.log(`Live stream ${payload.status}: ${payload.live_asset_id}`);
      // Your code: update the live session state
      break;

    case 'live.video.status.complete':
      console.log(`Live stream complete: ${payload.live_asset_id}`);
      // Your code: link payload.recording_asset_id and payload.vod_collection_id
      break;

    case 'event.video.uploaded':
    case 'event.video.updated':
      console.log(`Video event: ${type}`);
      // Your code: start downstream workflows or sync metadata
      break;

    case 'event.embed.viewed':
    case 'event.embed.cta_clicked':
      console.log(`Embed event: ${type}`);
      // Your code: record analytics
      break;

    case 'event.embed.form_submitted':
      console.log('Lead captured');
      // Your code: send the lead to your CRM
      break;

    case 'event.playlist.created':
    case 'event.playlist.asset':
    case 'event.playlist.deleted':
      console.log(`Playlist event: ${type}`);
      // Your code: sync playlists
      break;

    case 'event.comment.all':
      console.log('Comment event');
      // Your code: moderate or sync comments
      break;

    case 'event.channel.member_joined':
      console.log('Channel member joined');
      // Your code: onboard the member
      break;

    default:
      console.log(`Unhandled event: ${type}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyGumletRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing x-gumlet-token' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read as text so any content type is accepted.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as GumletPayload);
  } catch (err) {
    console.error('Error handling Gumlet event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
