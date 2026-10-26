// Generated with: invoice-ninja-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { detectEntity, verifyInvoiceNinjaRequest } from '../../../lib/verify-invoice-ninja';

// Deliveries are never cacheable: the credential check reads request headers.
export const dynamic = 'force-dynamic';

type InvoiceNinjaEntity = Record<string, unknown>;

function handleEntity(event: string | null, payload: InvoiceNinjaEntity): void {
  const entity = event ? null : detectEntity(payload);

  if (event === 'create_invoice') {
    console.log(`Invoice created: ${payload.number} (${payload.id})`);
    // TODO: sync the new invoice (payload.amount, payload.client_id, payload.line_items)
  } else if (event === 'create_payment') {
    console.log(`Payment created: ${payload.number} (${payload.id})`);
    // TODO: record the payment (payload.amount, payload.client_id, payload.invoices)
  } else if (event === 'update_client') {
    console.log(`Client updated: ${payload.name} (${payload.id})`);
    // TODO: refresh the client record (payload.contacts)
  } else if (event) {
    console.log(`Unhandled event: ${event}`);
  } else if (entity === 'document') {
    console.log(`Document received: ${payload.number} (${payload.id})`);
  } else if (entity === 'payment') {
    console.log(`Payment received: ${payload.number} (${payload.id})`);
  } else if (entity === 'client') {
    console.log(`Client received: ${payload.name} (${payload.id})`);
  } else {
    console.log('Unrecognised entity shape');
  }
}

// The method is the Invoice Ninja subscription's rest_method, which its server validates as
// post (the default) or put, so the same handler serves POST and PUT.
// Never answer 404, 405 or 410: Invoice Ninja deletes the webhook subscription when it sees them.
async function handle(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyInvoiceNinjaRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook credential' }, { status: 401 });
  }

  // Read as text so any content type is accepted. Invoice Ninja always sends a JSON body;
  // an empty one is still acknowledged.
  const raw = await request.text();
  let payload: InvoiceNinjaEntity = {};
  if (raw.trim() !== '') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
    }
    payload = parsed as InvoiceNinjaEntity;
  }

  try {
    handleEntity(request.nextUrl.searchParams.get('event'), payload);
  } catch (err) {
    console.error('Error handling Invoice Ninja webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export const POST = handle;
export const PUT = handle;
