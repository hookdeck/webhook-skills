// Generated with: meetgeek-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyMeetGeekSignature } from '../../../lib/meetgeek';

export async function POST(request: NextRequest) {
  const secret = process.env.MEETGEEK_WEBHOOK_SECRET;
  if (!secret) {
    console.error('MEETGEEK_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw bytes BEFORE parsing: the signature covers the exact body
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-mg-signature');

  if (!verifyMeetGeekSignature(rawBody, signature, secret)) {
    console.error('MeetGeek webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: { message?: string; meeting_id?: string };
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // No event-name field: branch on meeting_id
  if (payload.meeting_id) {
    // successful-analysis: fetch the meeting via the MeetGeek Public API. Dedupe on meeting_id
    // (retries and team-shared meetings can deliver it more than once).
    console.log(`MeetGeek analysis succeeded for meeting ${payload.meeting_id}`);
  } else {
    // failed-analysis
    console.log(`MeetGeek analysis failed: ${payload.message}`);
  }

  return new NextResponse(null, { status: 200 });
}
