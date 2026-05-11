// Generated with: intercom-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify an Intercom webhook signature.
 *
 * Intercom signs the raw JSON body with HMAC-SHA1 using your app's
 * client_secret. The signature is sent in X-Hub-Signature as "sha1=<hex>".
 */
function verifyIntercomWebhook(
  rawBody: string,
  signatureHeader: string | null,
  clientSecret: string
): boolean {
  if (!signatureHeader || !clientSecret) {
    return false;
  }

  const [algorithm, signature] = signatureHeader.split('=');
  if (algorithm !== 'sha1' || !signature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha1', clientSecret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body for signature verification
  const body = await request.text();
  const signature = request.headers.get('x-hub-signature');

  if (!verifyIntercomWebhook(body, signature, process.env.INTERCOM_CLIENT_SECRET!)) {
    console.error('Intercom signature verification failed');
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 401 }
    );
  }

  // Parse after verification
  const notification = JSON.parse(body);
  const topic: string = notification.topic;
  const item = notification.data?.item;

  console.log(`Received ${topic} (notification id: ${notification.id})`);

  switch (topic) {
    case 'ping':
      console.log('Ping received');
      break;

    case 'conversation.user.created':
      console.log('New conversation from user:', item?.id);
      break;

    case 'conversation.user.replied':
      console.log('User replied to conversation:', item?.id);
      break;

    case 'conversation.admin.replied':
      console.log('Admin replied to conversation:', item?.id);
      break;

    case 'conversation.admin.assigned':
      console.log('Conversation assigned:', item?.id);
      break;

    case 'conversation.admin.closed':
      console.log('Conversation closed:', item?.id);
      break;

    case 'contact.user.created':
      console.log('New user contact:', item?.id);
      break;

    case 'contact.lead.created':
      console.log('New lead contact:', item?.id);
      break;

    case 'contact.user.tag.created':
      console.log('Tag applied to user:', item?.id);
      break;

    case 'ticket.created':
      console.log('New ticket:', item?.id);
      break;

    case 'ticket.admin.assigned':
      console.log('Ticket assigned:', item?.id);
      break;

    case 'ticket.state.updated':
      console.log('Ticket state updated:', item?.id);
      break;

    default:
      console.log(`Unhandled topic: ${topic}`);
  }

  return NextResponse.json({ received: true });
}
