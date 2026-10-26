// Generated with: swoogo-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { parseBody, verifySwoogoRequest } from '../../../lib/verify-swoogo';

// The body names neither the object nor the action, so this skill's convention is one
// Swoogo webhook per trigger_object, with ?object=<trigger_object> in the webhook URL.
// Payloads are illustrative: they carry whatever fields the webhook was configured to send.
function handleChange(object: string | null, payload: Record<string, unknown>): void {
  switch (object) {
    case 'event':
      console.log(`Event changed: ${payload.id}`);
      // TODO: sync event details
      break;

    case 'contact':
      console.log(`Contact changed: ${payload.id}`);
      // TODO: sync the contact to your CRM
      break;

    case 'registrant':
      console.log(`Registrant changed: ${payload.id}`);
      // TODO: upsert the registrant (insert and update both arrive here)
      break;

    case 'speaker':
      console.log(`Speaker changed: ${payload.id}`);
      // TODO: sync the speaker roster
      break;

    case 'sponsor':
      console.log(`Sponsor changed: ${payload.id}`);
      // TODO: sync the sponsor list
      break;

    case 'session':
      console.log(`Session changed: ${payload.id}`);
      // TODO: refresh the agenda
      break;

    case 'session_attendance':
      console.log(`Session attendance changed: ${payload.id}`);
      // TODO: record the check-in
      break;

    case 'registrant_line_item':
      console.log(`Registrant line item changed: ${payload.id}`);
      // TODO: update fees and purchases
      break;

    default:
      console.log(`Unhandled trigger object: ${object}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifySwoogoRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook secret header' }, { status: 401 });
  }

  // Read as text so any content type is accepted.
  const raw = await request.text();
  const payload = parseBody(raw, request.headers.get('content-type') || '');
  if (!payload) {
    return NextResponse.json({ error: 'Expected a JSON object or form-encoded body' }, { status: 400 });
  }

  try {
    handleChange(request.nextUrl.searchParams.get('object'), payload);
  } catch (err) {
    console.error('Error handling Swoogo webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
