import { NextRequest, NextResponse } from 'next/server';
import { verifySendbirdWebhook } from '../../../lib/sendbird';

export async function POST(request: NextRequest) {
  const apiToken = process.env.SENDBIRD_API_TOKEN;
  if (!apiToken) {
    console.error('SENDBIRD_API_TOKEN is not set');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  // Raw body for signature verification (do not use request.json())
  const body = await request.text();
  const signature = request.headers.get('x-sendbird-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing x-sendbird-signature header' }, { status: 400 });
  }

  if (!verifySendbirdWebhook(body, signature, apiToken)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after verification
  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const category: string = payload.category;
  console.log(`Received ${category} event`);

  switch (category) {
    case 'group_channel:message_send':
      console.log(`Group message from ${payload.sender?.user_id} in ${payload.channel?.channel_url}:`, payload.payload?.message);
      // TODO: Offline push, SMS/email notification, moderation, etc.
      break;

    case 'group_channel:create':
      console.log(`Group channel created: ${payload.channel?.channel_url}`);
      break;

    case 'group_channel:join':
      console.log(`User joined group channel: ${payload.channel?.channel_url}`);
      break;

    case 'group_channel:leave':
      console.log(`User left group channel: ${payload.channel?.channel_url}`);
      break;

    case 'open_channel:message_send':
      console.log(`Open channel message from ${payload.sender?.user_id} in ${payload.channel?.channel_url}:`, payload.payload?.message);
      break;

    case 'user:block':
      console.log('User blocked another user');
      // TODO: Update your own block lists, audit log, etc.
      break;

    case 'user:unblock':
      console.log('User unblocked another user');
      break;

    default:
      console.log(`Unhandled event: ${category}`);
  }

  // Respond quickly: Sendbird waits 5 seconds and retries up to 3 times
  return NextResponse.json({ received: true });
}
