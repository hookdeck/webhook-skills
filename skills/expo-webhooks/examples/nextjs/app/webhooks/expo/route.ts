import { NextRequest, NextResponse } from 'next/server';
import { verifyExpoSignature, classifyPayload, type ExpoPayload } from '../../../lib/verify-expo';

function handleBuild(build: ExpoPayload) {
  switch (build.status) {
    case 'finished':
      console.log(`Build ${build.id} (${build.platform}) finished: ${build.artifacts?.buildUrl}`);
      // TODO: Download the artifact, notify the team, start QA
      break;
    case 'errored':
      console.log(`Build ${build.id} (${build.platform}) errored: ${build.error?.message}`);
      // TODO: Alert the on-call channel
      break;
    case 'canceled':
      console.log(`Build ${build.id} (${build.platform}) canceled`);
      break;
    default:
      console.log(`Unhandled build status: ${build.status}`);
  }
}

function handleSubmit(submission: ExpoPayload) {
  switch (submission.status) {
    case 'finished':
      console.log(`Submission ${submission.id} (${submission.platform}) finished`);
      // TODO: Announce the release
      break;
    case 'errored':
      console.log(
        `Submission ${submission.id} (${submission.platform}) errored: ${submission.submissionInfo?.error?.message}`
      );
      // TODO: Alert the release owner
      break;
    case 'canceled':
      console.log(`Submission ${submission.id} (${submission.platform}) canceled`);
      break;
    default:
      console.log(`Unhandled submission status: ${submission.status}`);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.EXPO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('EXPO_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const signature = request.headers.get('expo-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing expo-signature header' }, { status: 400 });
  }

  // Raw body for signature verification - don't use request.json() first
  const rawBody = await request.text();
  if (!verifyExpoSignature(rawBody, signature, secret)) {
    console.error('Expo webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after verification
  let payload: ExpoPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Use payload.id + payload.status to de-duplicate retried deliveries
  const type = classifyPayload(payload);
  if (type === 'BUILD') {
    handleBuild(payload);
  } else if (type === 'SUBMIT') {
    handleSubmit(payload);
  } else {
    console.log('Unrecognized Expo payload');
  }

  return NextResponse.json({ received: true, type });
}
