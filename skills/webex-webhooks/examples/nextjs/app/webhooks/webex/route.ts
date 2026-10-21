// Generated with: webex-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Webex webhook signature.
 *
 * When a webhook is created with a `secret`, Webex sends the hex HMAC-SHA1 of the
 * raw request body (keyed with the secret string as-is) in `X-Spark-Signature`.
 */
export function verifyWebexWebhook(
  rawBody: string,
  signature: string | null,
  secret: string | undefined
): boolean {
  if (!signature || !secret) {
    return false;
  }

  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');

  // Timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // Length mismatch = invalid
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body for signature verification (do not parse before verifying)
  const rawBody = await request.text();
  const signature = request.headers.get('x-spark-signature');
  const secret = process.env.WEBEX_WEBHOOK_SECRET;

  // Verify webhook signature
  if (!verifyWebexWebhook(rawBody, signature, secret)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload after verification
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Webex identifies an event by resource + event, e.g. messages + created
  const event = `${payload.resource}.${payload.event}`;
  const data = payload.data || {};

  console.log(`Received ${event} event`);

  // Handle the event based on type
  switch (event) {
    case 'messages.created':
      // The webhook carries ids only; GET /v1/messages/{id} to fetch the text
      console.log(`Message ${data.id} in room ${data.roomId} from ${data.personEmail}`);
      // TODO: Fetch the message with your bot token and reply, route commands, etc.
      break;

    case 'messages.deleted':
      console.log(`Message deleted: ${data.id}`);
      // TODO: Remove the message from your own store, audit log, etc.
      break;

    case 'memberships.created':
      console.log(`Membership created: ${data.personEmail} in room ${data.roomId}`);
      // TODO: Send a welcome message, sync access, etc.
      break;

    case 'memberships.deleted':
      console.log(`Membership deleted: ${data.personEmail} from room ${data.roomId}`);
      // TODO: Offboarding, access sync, etc.
      break;

    case 'rooms.created':
      console.log(`Room created: ${data.id}`);
      // TODO: Provision resources for the new room, etc.
      break;

    case 'rooms.updated':
      console.log(`Room updated: ${data.id}`);
      // TODO: Sync room state (e.g. locked/unlocked), etc.
      break;

    case 'meetings.started':
      console.log(`Meeting started: ${data.id}`);
      // TODO: Notify attendees, start tracking, etc.
      break;

    case 'meetings.ended':
      console.log(`Meeting ended: ${data.id}`);
      // TODO: Trigger follow-ups, summaries, etc.
      break;

    case 'attachmentActions.created':
      console.log(`Card action ${data.id} on message ${data.messageId}`);
      // TODO: GET /v1/attachment/actions/{id} to read the submitted inputs
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }

  // Return 200 to acknowledge receipt (Webex disables webhooks that keep failing)
  return NextResponse.json({ received: true });
}
