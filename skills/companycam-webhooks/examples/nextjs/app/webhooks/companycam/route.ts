// Generated with: companycam-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a CompanyCam webhook signature.
 * X-CompanyCam-Signature = Base64(HMAC-SHA1(webhook token, raw body)).
 * The base64 strings are compared as equal-length UTF-8 buffers.
 */
function verifyCompanyCamSignature(
  rawBody: Buffer,
  signature: string | null,
  token: string | undefined
): boolean {
  if (!signature || !token) return false;
  const expected = crypto.createHmac('sha1', token).update(rawBody).digest('base64');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false; // timingSafeEqual throws on length mismatch
  return crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  // Read the raw body for signature verification (do not JSON.parse first).
  const rawBody = Buffer.from(await request.arrayBuffer());

  const token = process.env.COMPANYCAM_WEBHOOK_TOKEN;
  if (!token) {
    console.error('COMPANYCAM_WEBHOOK_TOKEN is not set');
    return NextResponse.json({ error: 'Webhook token not configured' }, { status: 500 });
  }

  const signature = request.headers.get('x-companycam-signature');
  if (!signature) {
    return NextResponse.json(
      { error: 'Missing X-CompanyCam-Signature header' },
      { status: 401 }
    );
  }

  if (!verifyCompanyCamSignature(rawBody, signature, token)) {
    console.error('CompanyCam webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after verification. `event_type` carries the event name.
  let event: { event_type?: string; payload?: any };
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventType = event.event_type;
  const payload = event.payload || {};

  switch (eventType) {
    case 'project.created':
      console.log('Project created:', payload.id);
      // TODO: sync the new project to your CRM / job system
      break;

    case 'project.updated':
      console.log('Project updated:', payload.id);
      // TODO: keep your records in sync
      break;

    case 'photo.created':
      console.log('Photo created:', payload.id);
      // TODO: back up the photo, run tagging, etc.
      break;

    case 'photo.updated':
      console.log('Photo updated:', payload.id);
      // TODO: refresh derived assets
      break;

    case 'comment.created':
      console.log('Comment created:', payload.id);
      // TODO: notify the team
      break;

    case 'document.created':
      console.log('Document created:', payload.id);
      // TODO: sync the document
      break;

    case 'todo_list.completed':
      console.log('Checklist completed:', payload.id);
      // TODO: trigger close-out workflow
      break;

    case 'task.completed':
      console.log('Checklist task completed:', payload.id);
      // TODO: track progress
      break;

    default:
      console.log(`Unhandled event type: ${eventType}`);
  }

  // CompanyCam expects exactly HTTP 200; anything else is retried.
  return NextResponse.json({ received: true }, { status: 200 });
}
