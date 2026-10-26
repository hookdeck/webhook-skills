// Generated with: uploadcare-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyUploadcareSignature } from '../../../lib/verify-uploadcare';

function handleEvent(payload: any): void {
  const event = payload?.hook?.event;

  switch (event) {
    case 'file.uploaded':
      console.log(`File uploaded: ${payload.data?.uuid}`);
      // TODO: save a record for payload.data / payload.file (CDN URL)
      break;

    case 'file.stored':
      console.log(`File stored: ${payload.data?.uuid}`);
      // TODO: mark the upload as permanent
      break;

    case 'file.info_updated':
      console.log(`File info updated: ${payload.data?.uuid}`);
      // TODO: sync payload.data.metadata / appdata (v0.7); see payload.previous_values
      break;

    case 'file.infected':
      console.log(`File infected: ${payload.data?.uuid}`);
      // TODO: quarantine or delete the file
      break;

    case 'file.deleted':
      console.log(`File deleted: ${payload.data?.uuid}`);
      // TODO: remove your matching record
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

export async function POST(request: NextRequest) {
  // Read the exact bytes (any content type); verify before parsing.
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyUploadcareSignature(rawBody, request.headers.get('x-uc-signature'))) {
    return NextResponse.json({ error: 'Invalid or missing signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Uploadcare event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
