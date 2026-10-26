// Generated with: aws-eventbridge-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyAwsEventbridgeRequest } from '../../../lib/verify-aws-eventbridge';

interface EventBridgeEnvelope {
  version?: string;
  id?: string;
  'detail-type'?: string;
  source?: string;
  account?: string;
  time?: string;
  region?: string;
  resources?: string[];
  detail?: Record<string, any>;
}

function handleEvent(event: EventBridgeEnvelope): void {
  const { source } = event;
  const detailType = event['detail-type'];
  const detail = event.detail || {};

  if (source === 'aws.ec2' && detailType === 'EC2 Instance State-change Notification') {
    console.log(`EC2 instance ${detail['instance-id']} is now ${detail.state}`);
    // TODO: react to the instance state change (detail['instance-id'], detail.state)
  } else if (source === 'aws.s3' && detailType === 'Object Created') {
    console.log(`S3 object created: ${detail.bucket?.name}/${detail.object?.key}`);
    // TODO: process the new object (detail.bucket.name, detail.object.key)
  } else if (source === 'com.example.orders' && detailType === 'OrderCreated') {
    console.log(`Order created: ${detail.orderId}`);
    // TODO: fulfil the order (your own source and detail-type go here)
  } else {
    console.log(`Unhandled event: ${source} / ${detailType}`);
  }
}

// The API destination method is configurable, so every supported method uses one handler.
async function handle(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyAwsEventbridgeRequest(request.headers)) {
    return NextResponse.json(
      { error: 'Invalid or missing Basic credentials' },
      { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="aws-eventbridge"' } }
    );
  }

  // Read as text so any content type is accepted; GET and DELETE usually have no body.
  const raw = await request.text();
  if (raw.trim() === '') {
    return NextResponse.json({ received: true });
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = null;
  }

  try {
    if (payload && typeof payload === 'object' && !Array.isArray(payload) && 'detail-type' in payload) {
      handleEvent(payload as EventBridgeEnvelope); // default event envelope
    } else {
      // An input transformer builds the body, so its shape is whatever your template says.
      console.log('Received a transformed (non-envelope) payload');
    }
  } catch (err) {
    console.error('Error handling EventBridge event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const GET = handle;
export const DELETE = handle;
