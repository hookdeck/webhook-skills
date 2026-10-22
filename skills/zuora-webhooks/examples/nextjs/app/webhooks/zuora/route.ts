// Generated with: zuora-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyZuoraRequest } from '../../../lib/verify-zuora';

// Callouts are never cacheable, including GET.
export const dynamic = 'force-dynamic';

interface ZuoraPayload {
  event?: string;
  accountId?: string;
  [key: string]: unknown;
}

/**
 * Zuora adds no event field: the body is whatever merge fields the callout template
 * defines. This handler assumes an illustrative JSON body such as
 * {"event": "PaymentProcessed", "accountId": "..."} that you write into the template.
 */
function handleCallout(payload: ZuoraPayload): void {
  const { event } = payload;

  switch (event) {
    case 'PaymentProcessed':
      console.log(`Payment processed for account ${payload.accountId}`);
      // TODO: mark the invoice paid, then fetch full details from the Zuora API
      break;

    case 'InvoicePosted':
      console.log(`Invoice posted for account ${payload.accountId}`);
      // TODO: email the invoice, then fetch full details from the Zuora API
      break;

    default:
      console.log(`Unhandled callout: ${event}`);
  }
}

// The callout HTTP method is set on the template (POST by default), so one handler serves all five.
async function handle(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyZuoraRequest(request.headers)) {
    return NextResponse.json(
      { error: 'Invalid or missing Basic credentials' },
      { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="zuora"' } }
    );
  }

  // Read as text so any content type is accepted. GET carries no body.
  const raw = await request.text();
  let payload: unknown;
  if (raw.trim() === '') {
    // Merge fields placed in the URL arrive as query parameters.
    payload = Object.fromEntries(request.nextUrl.searchParams);
  } else {
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
    handleCallout(payload as ZuoraPayload);
  } catch (err) {
    console.error('Error handling Zuora callout:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  // Zuora needs a 200; "success" satisfies the optional "Confirm success by parsing response content".
  return NextResponse.json({ received: true, success: true });
}

export { handle as POST, handle as PUT, handle as PATCH, handle as GET, handle as DELETE };
