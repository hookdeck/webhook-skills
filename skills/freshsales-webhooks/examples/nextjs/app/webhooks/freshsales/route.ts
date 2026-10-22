// Generated with: freshsales-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyFreshsalesRequest } from '../../../lib/verify-freshsales';

interface FreshsalesPayload {
  deal?: { id?: string; name?: string; [key: string]: unknown };
  contact?: { id?: string; email?: string; [key: string]: unknown };
  [key: string]: unknown;
}

/**
 * Freshsales sends no event type: the body is whatever the workflow author chose
 * (Simple fields or Advanced content with placeholders). This example assumes an
 * illustrative Advanced body with a top-level "deal" or "contact" object.
 */
function handlePayload(method: string, payload: FreshsalesPayload | null): void {
  if (payload?.deal) {
    console.log(`Deal webhook (${method}): ${payload.deal.id} ${payload.deal.name ?? ''}`);
    // TODO: sync the deal (payload.deal.amount, payload.deal.stage)
    return;
  }
  if (payload?.contact) {
    console.log(`Contact webhook (${method}): ${payload.contact.id} ${payload.contact.email ?? ''}`);
    // TODO: sync the contact (payload.contact.first_name, payload.contact.email)
    return;
  }
  console.log(`Freshsales webhook (${method}) with no deal or contact object`);
}

// The workflow's request type is user-chosen, so one handler serves every method.
async function handle(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyFreshsalesRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook secret header' }, { status: 401 });
  }

  // Read as text so any content type is accepted; GET and DELETE give an empty string.
  const raw = await request.text();
  let payload: FreshsalesPayload | null = null;
  if (raw.trim() !== '') {
    try {
      payload = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body (set Encoding to JSON)' }, { status: 400 });
    }
  }

  try {
    handlePayload(request.method, payload);
  } catch (err) {
    console.error('Error handling Freshsales webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const GET = handle;
export const DELETE = handle;
