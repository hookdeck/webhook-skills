// Generated with: ory-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyOryRequest } from '../../../lib/verify-ory';

interface OryPayload {
  event?: string;
  identity?: { id?: string; [key: string]: unknown };
  [key: string]: unknown;
}

function handleEvent(payload: OryPayload): void {
  // `event` comes from YOUR Jsonnet template; these names are the illustrative ones.
  const { event, identity } = payload;
  const id = identity?.id;

  switch (event) {
    case 'registration.after':
      console.log(`Identity registered: ${id}`);
      // TODO: add the user to your CRM or newsletter
      break;

    case 'login.after':
      console.log(`Identity logged in: ${id}`);
      // TODO: record the sign-in
      break;

    case 'settings.after':
      console.log(`Identity updated settings: ${id}`);
      // TODO: sync updated traits
      break;

    case 'verification.after':
      console.log(`Identity verified an address: ${id}`);
      // TODO: mark the address as verified downstream
      break;

    case 'recovery.after':
      console.log(`Identity recovered account: ${id}`);
      // TODO: notify the user
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

// Ory lets you pick the HTTP method for each action, so one handler serves several.
async function handler(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyOryRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook credential' }, { status: 401 });
  }

  // The body is optional (a GET action has none). Read as text so any content type works.
  const raw = await request.text();
  let payload: unknown = {};
  if (raw.trim() !== '') {
    try {
      payload = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
    }
  }

  try {
    handleEvent(payload as OryPayload);
  } catch (err) {
    console.error('Error handling Ory event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH };
