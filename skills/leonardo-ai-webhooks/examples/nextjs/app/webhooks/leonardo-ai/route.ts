// Generated with: leonardo-ai-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyLeonardoRequest } from '../../../lib/verify-leonardo-ai';

interface LeonardoPayload {
  type?: string;
  data?: { object?: { id?: string; status?: string; images?: { url?: string }[] } };
  [key: string]: unknown;
}

function handleEvent(payload: LeonardoPayload): void {
  switch (payload.type) {
    case 'image_generation.complete': {
      const generation = payload.data?.object;
      // Don't log the whole payload: the documented sample embeds the callback key.
      console.log(
        `Generation ${generation?.id} ${generation?.status}: ${generation?.images?.length ?? 0} image(s)`
      );
      // TODO: download images[].url, update your job record, notify the user
      break;
    }

    default:
      console.log(`Unhandled event: ${payload.type}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyLeonardoRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Authorization Bearer key' }, { status: 401 });
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
    handleEvent(payload as LeonardoPayload);
  } catch (err) {
    console.error('Error handling Leonardo.Ai event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
