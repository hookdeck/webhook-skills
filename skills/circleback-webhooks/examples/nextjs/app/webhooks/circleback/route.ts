// Generated with: circleback-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

// Subset of Circleback's meeting export. Which fields are present follows the
// automation's settings (notes, action items, transcript, insights).
interface CirclebackMeeting {
  id: string;
  name: string;
  createdAt: string;
  duration: number;
  url: string | null;
  recordingUrl: string | null;
  tags: string[];
  attendees?: Array<{ name: string | null; email: string | null }>;
  notes?: string;
  actionItems?: Array<{
    id: number;
    title: string;
    description: string;
    assignee: { name: string | null; email: string | null } | null;
    status: 'PENDING' | 'DONE';
  }>;
  transcript?: Array<{ speaker: string; text: string; timestamp: number }>;
}

/**
 * Verify Circleback's x-signature: bare hex HMAC-SHA256 of the raw body,
 * keyed with the signing secret (UTF-8). No timestamp, no prefix.
 */
function verifyCirclebackSignature(rawBody: string, signature: string | null, secret: string): boolean {
  // Validate before decoding: Buffer.from(x, 'hex') silently truncates invalid hex
  if (!signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

/**
 * Circleback has no event types: every delivery is one meeting export.
 */
function handleMeeting(meeting: CirclebackMeeting) {
  console.log(`Meeting: "${meeting.name}" (${meeting.id}, ${meeting.duration}s)`);
  console.log(`Link: https://circleback.ai/meetings/${meeting.id}`);

  if (meeting.notes) {
    console.log('Notes:', meeting.notes);
  }

  for (const item of meeting.actionItems ?? []) {
    console.log(`Action item [${item.status}]: ${item.title} (assignee: ${item.assignee?.email ?? 'unassigned'})`);
  }

  if (meeting.transcript) {
    console.log(`Transcript: ${meeting.transcript.length} segments`);
  }

  // TODO: Sync notes to your CRM, post the summary to Slack, create tasks, etc.
  // Deduplicate on meeting.id: Circleback sends no delivery ID header.
}

export async function POST(request: NextRequest) {
  const secret = process.env.CIRCLEBACK_SIGNING_SECRET;
  if (!secret) {
    console.error('CIRCLEBACK_SIGNING_SECRET is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Read the raw body - verification must run on the exact bytes Circleback sent
  const rawBody = await request.text();

  if (!verifyCirclebackSignature(rawBody, request.headers.get('x-signature'), secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let meeting: CirclebackMeeting;
  try {
    meeting = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    handleMeeting(meeting);
  } catch (err) {
    console.error('Error handling Circleback webhook:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
