// Generated with: wiza-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyWizaRequest } from '../../../lib/verify-wiza';

interface WizaPayload {
  type?: string;
  status?: { code?: number; message?: string };
  data?: { id?: number | string; [key: string]: unknown };
  [key: string]: unknown;
}

function handleEvent(payload: WizaPayload): void {
  const { type, status, data } = payload;
  const id = data?.id; // the reveal's id; the envelope has no top-level id

  switch (type) {
    case 'individual_reveal':
      if (status?.code === 200) {
        console.log(`Reveal ${id} finished`);
        // TODO: store the contact details in payload.data
      } else if (status?.code === 400) {
        console.log(`Reveal ${id} failed`);
        // TODO: flag the lookup as failed or retry it
      } else {
        console.log(`Reveal ${id} has status ${status?.code}`);
      }
      break;

    default:
      console.log(`Unhandled event type: ${type}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyWizaRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing x-auth-key' }, { status: 401 });
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
    handleEvent(payload as WizaPayload);
  } catch (err) {
    console.error('Error handling Wiza event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
