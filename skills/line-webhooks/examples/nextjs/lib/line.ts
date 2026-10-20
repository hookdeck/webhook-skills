// Generated with: line-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { validateSignature } from '@line/bot-sdk';

// Minimal shape of a LINE webhook event. The SDK also exports full
// webhook.Event types if you want exhaustive typing.
export type LineEvent = {
  type: string;
  timestamp: number;
  mode: 'active' | 'standby';
  webhookEventId: string;
  deliveryContext: { isRedelivery: boolean };
  replyToken?: string;
  source?: { type: 'user' | 'group' | 'room'; userId?: string; groupId?: string; roomId?: string };
  [key: string]: any;
};

export type LineWebhookBody = {
  destination: string;
  events: LineEvent[];
};

/**
 * Verify a LINE webhook signature: base64(HMAC-SHA256(channel secret, raw body))
 * compared timing-safe against the x-line-signature header.
 */
export function verifyLineSignature(
  rawBody: string | Buffer,
  signature: string | null | undefined,
  channelSecret: string | undefined,
): boolean {
  if (!signature || !channelSecret) return false;
  try {
    return validateSignature(rawBody, channelSecret, signature);
  } catch {
    return false;
  }
}

export function handleEvent(event: LineEvent): void {
  switch (event.type) {
    case 'message':
      // message.type: text, image, video, audio, file, location, sticker
      console.log(`Message (${event.message.type}) from ${event.source?.userId}:`, event.message.text ?? event.message.id);
      // TODO: Reply with event.replyToken via the Messaging API reply endpoint
      break;

    case 'messageEdited':
      console.log('Message edited:', event.message.id);
      // TODO: Update the stored copy of the message (latest timestamp wins)
      break;

    case 'unsend':
      console.log('Message unsent:', event.unsend.messageId);
      // TODO: Delete the stored message so it can't be seen or used again
      break;

    case 'follow':
      console.log(`Followed by ${event.source?.userId} (unblocked: ${event.follow?.isUnblocked})`);
      // TODO: Send a welcome message, create the user record
      break;

    case 'unfollow':
      console.log(`Blocked by ${event.source?.userId}`);
      // TODO: Stop messaging this user
      break;

    case 'join':
      console.log(`Joined ${event.source?.type}:`, event.source?.groupId ?? event.source?.roomId);
      break;

    case 'leave':
      console.log(`Left ${event.source?.type}:`, event.source?.groupId ?? event.source?.roomId);
      break;

    case 'memberJoined':
      console.log('Members joined:', event.joined.members.map((m: { userId: string }) => m.userId));
      break;

    case 'memberLeft':
      console.log('Members left:', event.left.members.map((m: { userId: string }) => m.userId));
      break;

    case 'postback':
      console.log('Postback:', event.postback.data);
      // TODO: Route on postback.data (and postback.params for date/time pickers)
      break;

    case 'videoPlayComplete':
      console.log('Video watched:', event.videoPlayComplete.trackingId);
      break;

    case 'beacon':
      console.log(`Beacon ${event.beacon.type}:`, event.beacon.hwid);
      break;

    case 'accountLink':
      console.log(`Account link ${event.link.result}, nonce:`, event.link.nonce);
      // TODO: Look up the nonce and link accounts if result === 'ok'
      break;

    case 'membership':
      console.log(`Membership ${event.membership.type}:`, event.membership.membershipId);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}
