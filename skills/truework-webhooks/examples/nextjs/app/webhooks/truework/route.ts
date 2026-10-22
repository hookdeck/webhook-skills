// Generated with: truework-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { TOKEN_HEADER, handleTrueworkEvent, verifyTrueworkToken } from '../../../lib/truework';

export async function POST(request: NextRequest) {
  // Authenticate before parsing anything. Nothing is signed, so the raw body
  // is only read afterwards, whatever the content type.
  const auth = verifyTrueworkToken(request.headers.get(TOKEN_HEADER));
  if (auth === null) {
    console.error('Truework webhook refused: TRUEWORK_WEBHOOK_TOKEN is not set');
    return NextResponse.json({ error: 'Webhook authentication not configured' }, { status: 500 });
  }
  if (!auth) {
    return NextResponse.json({ error: 'Invalid or missing X-Truework-Token' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const event = handleTrueworkEvent(payload);
  return NextResponse.json({ received: true, event }, { status: 200 });
}
