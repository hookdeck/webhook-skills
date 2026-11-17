// Generated with: estuary-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { classify, verifyEstuaryRequest } from '../../../lib/verify-estuary';

function handleEvent(payload: unknown): void {
  switch (classify(payload)) {
    case 'trigger':
      console.log('Estuary trigger received');
      // Your code: react to the committed transaction (e.g. start a downstream job)
      break;
    case 'documents':
      console.log(`Estuary connector batch: ${(payload as unknown[]).length} documents`);
      // Your code: store or process the documents
      break;
    default:
      console.log('Estuary request with an empty body');
  }
}

async function handle(request: NextRequest) {
  // Credential first, for every method, before the body is read.
  if (!verifyEstuaryRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing credential header' }, { status: 401 });
  }

  // Raw text so any content type works; GET and DELETE give an empty string.
  const raw = await request.text();
  let payload: unknown = null;
  if (raw.trim() !== '') {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { raw }; // the payloadTemplate may not be JSON
    }
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Estuary webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// Triggers default to POST and can use PUT or PATCH; GET and DELETE are accepted too.
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
