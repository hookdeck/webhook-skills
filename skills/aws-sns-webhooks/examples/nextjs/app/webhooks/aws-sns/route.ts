// Generated with: aws-sns-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import MessageValidator from 'sns-validator';

// sns-validator fetches the cert from SigningCertURL and RSA-verifies the
// signature, so this route must run on the Node.js runtime (not Edge).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SnsMessage {
  Type: string;
  MessageId: string;
  TopicArn: string;
  Subject?: string;
  Message?: string;
  Token?: string;
  SubscribeURL?: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  UnsubscribeURL?: string;
}

const validator = new MessageValidator();

function validate(message: SnsMessage): Promise<void> {
  return new Promise((resolve, reject) => {
    validator.validate(message, (err: Error | null) => (err ? reject(err) : resolve()));
  });
}

export async function POST(request: Request) {
  // x-amz-sns-message-type lets us branch without parsing the body first.
  const messageType = request.headers.get('x-amz-sns-message-type');
  if (!messageType) {
    return NextResponse.json(
      { error: 'Missing x-amz-sns-message-type header' },
      { status: 400 }
    );
  }

  // SNS signs specific envelope fields; parse the raw body and let sns-validator
  // verify the parsed object.
  const rawBody = await request.text();
  let message: SnsMessage;
  try {
    message = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Verify authenticity before doing anything else.
  try {
    await validate(message);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown error';
    console.error('SNS signature verification failed:', detail);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Optionally reject topics we don't expect (there is no shared secret).
  const allowedTopicArn = process.env.AWS_SNS_TOPIC_ARN;
  if (allowedTopicArn && message.TopicArn !== allowedTopicArn) {
    console.warn('Rejected message from unexpected topic:', message.TopicArn);
    return NextResponse.json({ error: 'Untrusted topic' }, { status: 403 });
  }

  switch (messageType) {
    case 'SubscriptionConfirmation': {
      // Confirm the subscription by visiting SubscribeURL, or SNS never
      // delivers notifications.
      try {
        const response = await fetch(message.SubscribeURL as string);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        console.log('Subscription confirmed for topic:', message.TopicArn);
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'unknown error';
        console.error('Failed to confirm subscription:', detail);
        return NextResponse.json(
          { error: 'Failed to confirm subscription' },
          { status: 500 }
        );
      }
      break;
    }

    case 'Notification': {
      // De-duplicate on message.MessageId — SNS retries can redeliver.
      console.log('Notification received:', message.MessageId);
      console.log('Subject:', message.Subject);
      console.log('Message:', message.Message);
      // Your code: process the notification (message.Message is often JSON).
      break;
    }

    case 'UnsubscribeConfirmation': {
      // The endpoint was unsubscribed. Re-subscribe here if unexpected.
      console.log('Unsubscribe confirmation for topic:', message.TopicArn);
      break;
    }

    default:
      console.log('Unhandled SNS message type:', messageType);
  }

  // Respond 2xx within ~15s or SNS treats delivery as failed and retries.
  return NextResponse.json({ received: true });
}
