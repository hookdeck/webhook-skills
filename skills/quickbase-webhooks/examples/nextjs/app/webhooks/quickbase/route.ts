// Generated with: quickbase-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyQuickbaseRequest } from '../../../lib/verify-quickbase';

interface QuickbasePayload {
  action?: string;
  record_id?: unknown;
  [key: string]: unknown;
}

/**
 * Quickbase adds no event field. Put "action": "%action%" in your message body template:
 * Quickbase replaces the %action% marker with Add, Replace or Delete, depending on what
 * triggered the webhook.
 */
function handleEvent(payload: QuickbasePayload): void {
  switch (payload.action) {
    case 'Add':
      console.log(`Record added: ${payload.record_id}`);
      // Create the record in your system
      break;

    case 'Replace':
      console.log(`Record modified: ${payload.record_id}`);
      // Update the record in your system
      break;

    case 'Delete':
      console.log(`Record deleted: ${payload.record_id}`);
      // Remove the record from your system
      break;

    default:
      console.log('Unrecognized Quickbase payload; acknowledging');
  }
}

/** Parse the body only after authentication. Accepts JSON, XML, RAW text or nothing. */
function parseBody(text: string): QuickbasePayload | null {
  if (!text.trim()) return null; // empty body (e.g. GET or DELETE)
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null; // XML or RAW: nothing to dispatch on
  }
}

// The HTTP method is chosen in the Quickbase webhook (POST is the default), so handle all five.
async function handle(request: NextRequest): Promise<NextResponse> {
  // Authenticate before reading or parsing the body.
  if (!verifyQuickbaseRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook secret header' }, { status: 401 });
  }

  try {
    // Read as text so any content type (JSON, XML, RAW) is accepted.
    const text = await request.text();
    const payload = parseBody(text);
    if (payload) handleEvent(payload);
    else console.log(`Quickbase ${request.method} with ${text.length} char non-JSON/empty body`);
  } catch (err) {
    console.error('Error handling Quickbase webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const GET = handle;
export const DELETE = handle;
