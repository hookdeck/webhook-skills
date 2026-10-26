// Generated with: tutorcruncher-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyTutorCruncherSignature } from '../../../lib/verify-tutorcruncher';

type JsonObject = Record<string, unknown>;

const isObject = (v: unknown): v is JsonObject =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

// One webhook carries {events: [...]}; each element has its own `action`.
function handleEvent(event: JsonObject): void {
  const subject = isObject(event.subject) ? event.subject : {};

  switch (event.action) {
    case 'CREATED_A_CONTRACTOR':
      console.log(`Tutor created: ${subject.id} (${subject.email})`);
      // TODO: onboard the tutor in your system
      break;

    case 'CHANGED_CONTRACTOR_STATUS':
      console.log(`Tutor status changed: ${subject.id} -> ${subject.status}`);
      // TODO: sync the tutor's status
      break;

    case 'CLIENT_ENQUIRY':
      console.log(`Client enquiry from: ${subject.id}`);
      // TODO: create a lead
      break;

    case 'CREATED_AN_APPOINTMENT':
      console.log(`Lesson created: ${subject.id}`);
      // TODO: sync to your calendar
      break;

    case 'RAISED_INVOICE':
      console.log(`Invoice raised: ${subject.id}`);
      // TODO: push to accounting
      break;

    default:
      console.log(`Unhandled action: ${String(event.action)}`);
  }
}

// TutorCruncher's docs don't name the HTTP method, so the same handler serves all five.
async function handle(request: NextRequest) {
  // Read the raw bytes (any content type); a request with no body is verified over zero bytes.
  const rawBody = new Uint8Array(await request.arrayBuffer());

  if (!verifyTutorCruncherSignature(rawBody, request.headers.get('webhook-signature'))) {
    return NextResponse.json({ error: 'Invalid or missing signature' }, { status: 401 });
  }

  // Verified and empty (e.g. GET): acknowledge.
  if (rawBody.length === 0) {
    return NextResponse.json({ received: true });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Treat every field as untrusted: check types before reading into them.
  if (!isObject(payload) || !Array.isArray(payload.events)) {
    return NextResponse.json({ error: 'Expected {"events": [...]}' }, { status: 400 });
  }

  try {
    for (const event of payload.events) {
      if (isObject(event) && typeof event.action === 'string') handleEvent(event);
    }
  } catch (err) {
    console.error('Error handling TutorCruncher webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
