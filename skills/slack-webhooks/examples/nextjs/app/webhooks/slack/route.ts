// Generated with: slack-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Slack Events API request.
 *
 * Slack signs `v0:{timestamp}:{raw_body}` with HMAC-SHA256 using the app's
 * signing secret and sends the result as `X-Slack-Signature: v0=<hex>`.
 */
export function verifySlackRequest(
  rawBody: string,
  signatureHeader: string | null,
  timestampHeader: string | null,
  signingSecret: string
): boolean {
  if (!signatureHeader || !timestampHeader || !signingSecret) {
    return false;
  }

  const timestamp = parseInt(timestampHeader, 10);
  if (Number.isNaN(timestamp)) {
    return false;
  }

  // Replay protection: reject requests older than 5 minutes
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 60 * 5) {
    return false;
  }

  // Slack signs the literal string: "v0:" + timestamp + ":" + raw body
  const basestring = `v0:${timestamp}:${rawBody}`;
  const expected =
    'v0=' +
    crypto
      .createHmac('sha256', signingSecret)
      .update(basestring, 'utf8')
      .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body — Slack signs the raw bytes, not parsed JSON
  const rawBody = await request.text();
  const signature = request.headers.get('x-slack-signature');
  const timestamp = request.headers.get('x-slack-request-timestamp');

  if (!verifySlackRequest(rawBody, signature, timestamp, process.env.SLACK_SIGNING_SECRET!)) {
    console.error('Slack signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // One-time url_verification challenge when configuring the Request URL
  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge });
  }

  if (payload.type === 'event_callback') {
    const event = payload.event ?? {};

    console.log(`Received ${event.type} (event_id: ${payload.event_id})`);

    switch (event.type) {
      case 'app_mention':
        console.log(`Mentioned by ${event.user} in ${event.channel}: ${event.text}`);
        // TODO: Reply via chat.postMessage
        break;

      case 'message':
        console.log(`Message from ${event.user} in ${event.channel}: ${event.text}`);
        // TODO: Moderation, logging, automation
        break;

      case 'reaction_added':
        console.log(`Reaction :${event.reaction}: added by ${event.user}`);
        // TODO: Approval workflows, polls
        break;

      case 'reaction_removed':
        console.log(`Reaction :${event.reaction}: removed by ${event.user}`);
        break;

      case 'team_join':
        console.log(`New team member joined: ${event.user?.id ?? event.user}`);
        // TODO: Onboarding DM, CRM sync
        break;

      case 'member_joined_channel':
        console.log(`${event.user} joined channel ${event.channel}`);
        break;

      case 'app_home_opened':
        console.log(`App home opened by ${event.user}`);
        // TODO: Publish the App Home view
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  }

  // Slack requires a 2xx response within 3 seconds, or it will retry
  return NextResponse.json({ received: true });
}
