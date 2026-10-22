// Generated with: pubnub-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { eventTypeFromSchema, verifyPubNubRequest } from '../../../lib/verify-pubnub';

type PubNubItem = Record<string, any>;

// Each item in payload.data is one event of the type named by payload.dataSchema.
function handleItem(type: string, item: PubNubItem): void {
  switch (type) {
    case 'messages.pubsub.publish':
      // Also used for File sent: those items carry fileId and fileName.
      console.log(`Message on ${item.channel} from ${item.senderId}`);
      // TODO: process item.message (item.timetoken is the dedupe key)
      break;

    case 'messages.action.created':
      console.log(`Message action added on ${item.channel} by ${item.userId}`);
      break;

    case 'messages.action.deleted':
      console.log(`Message action removed on ${item.channel} by ${item.userId}`);
      break;

    case 'presence.user.channel.joined':
      console.log(`${item.userId} joined ${item.channel} (occupancy ${item.occupancy})`);
      break;

    case 'presence.user.channel.left':
      console.log(`${item.userId} left ${item.channel} (occupancy ${item.occupancy})`);
      break;

    case 'presence.user.timedout.in.channel':
      console.log(`${item.userId} timed out in ${item.channelId}`);
      break;

    case 'presence.channel.user.state.in.changed':
      console.log(`${item.userId} changed state in ${item.channel}`);
      break;

    case 'presence.channel.state.active':
      console.log(`First user subscribed to ${item.channel}`);
      break;

    case 'presence.channel.state.inactive':
      console.log(`Last user left ${item.channel}`);
      break;

    case 'presence.channel.occupancy.counted':
      console.log(`Occupancy of ${item.channel}: ${item.occupancy}`);
      break;

    case 'user.created':
      console.log(`User created: ${item.userId}`);
      // TODO: provision the user in your system
      break;

    case 'user.updated':
      console.log(`User updated: ${item.userId}`);
      break;

    case 'user.deleted':
      console.log(`User deleted: ${item.userId}`);
      break;

    case 'channel.created':
      console.log(`Channel created: ${item.channelId}`);
      break;

    case 'channel.updated':
      console.log(`Channel updated: ${item.channelId}`);
      break;

    case 'channel.deleted':
      console.log(`Channel deleted: ${item.channelId}`);
      break;

    case 'membership.created':
      console.log(`Membership created: ${item.userId} in ${item.channelId}`);
      break;

    case 'membership.updated':
      console.log(`Membership updated: ${item.userId} in ${item.channelId}`);
      break;

    case 'membership.deleted':
      console.log(`Membership deleted: ${item.userId} in ${item.channelId}`);
      break;

    case 'push.device.removed':
      console.log(`Push device removed: ${item.device}`);
      break;

    case 'push.message.sending.failed':
      console.log(`Push failed on ${item.channel}: ${item.payload}`);
      break;

    default:
      console.log(`Unhandled event: ${type}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyPubNubRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook secret header' }, { status: 401 });
  }

  let payload: any;
  try {
    // Read as text so any content type is accepted.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const type = payload && typeof payload === 'object' ? eventTypeFromSchema(payload.dataSchema) : null;
  if (!type || !Array.isArray(payload.data)) {
    return NextResponse.json(
      { error: 'Expected a No Envelope payload with dataSchema and data' },
      { status: 400 }
    );
  }

  try {
    for (const item of payload.data) handleItem(type, item || {});
  } catch (err) {
    console.error('Error handling PubNub event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
