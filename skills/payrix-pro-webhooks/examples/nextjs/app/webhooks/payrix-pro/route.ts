// Generated with: payrix-pro-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyPayrixProRequest, parseBody } from '../../../lib/verify-payrix-pro';

function handleAlert(payload: unknown): void {
  // The payload shape isn't documented; this is an illustrative transaction alert:
  // { "alert": "transaction", "transaction": { "id": "t1_txn_...", "total": 1500 } }
  if (payload && typeof payload === 'object') {
    console.log('Payrix Pro alert (JSON):', JSON.stringify(payload).slice(0, 200));
  } else if (payload) {
    console.log('Payrix Pro alert (raw text):', String(payload).slice(0, 200));
  } else {
    console.log('Payrix Pro alert (empty body)');
  }
  // TODO: dispatch on the fields your alert actually sends
}

async function handler(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyPayrixProRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook header' }, { status: 401 });
  }

  // Read as text so any content type is accepted; GET/DELETE may have no body.
  const raw = await request.text();
  const { payload, error } = parseBody(raw, request.headers.get('content-type'));
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  try {
    handleAlert(payload);
  } catch (err) {
    console.error('Error handling Payrix Pro alert:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// Payrix doesn't document the HTTP method, so accept all of them.
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
