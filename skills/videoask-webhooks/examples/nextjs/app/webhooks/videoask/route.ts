// Generated with: videoask-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyVideoAskRequest } from '../../../lib/verify-videoask';

interface VideoAskContact {
  contact_id?: string;
  email?: string;
  [key: string]: unknown;
}

interface VideoAskPayload {
  event_id?: string;
  event_type?: string;
  contact?: VideoAskContact;
  [key: string]: unknown;
}

function handleEvent(payload: VideoAskPayload): void {
  const { event_type: eventType, contact } = payload;
  const who = contact && (contact.email || contact.contact_id);

  switch (eventType) {
    case 'form_response':
      console.log(`Response received from ${who}`);
      // TODO: store payload.contact.answers
      break;

    case 'form_response_transcribed':
      console.log(`Response transcribed for ${who}`);
      // TODO: store transcripts from payload.contact.answers[].transcription
      break;

    case 'form_author_message':
      console.log(`Author message sent to ${who}`);
      // TODO: log payload.contact.messages
      break;

    case 'form_contact_message':
      console.log(`Contact message from ${who}`);
      // TODO: notify the team
      break;

    // Tag events are listed in VideoAsk's help centre; their payload isn't shown in the docs.
    case 'form_contact_tagged':
      console.log(`Tag added to contact ${who}`);
      // TODO: sync the contact's tags
      break;

    case 'form_contact_untagged':
      console.log(`Tag removed from contact ${who}`);
      // TODO: sync the contact's tags
      break;

    default:
      console.log(`Unhandled event: ${eventType}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyVideoAskRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook secret header' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read as text so any content type is accepted.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as VideoAskPayload);
  } catch (err) {
    console.error('Error handling VideoAsk event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
