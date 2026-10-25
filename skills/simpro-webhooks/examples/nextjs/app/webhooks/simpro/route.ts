import { NextRequest, NextResponse } from 'next/server';
import { verifySimproSignature } from '../../../lib/verify-simpro';

type SimproEvent = {
  ID?: string;
  build?: string;
  description?: string;
  name?: string;
  action?: string;
  reference?: Record<string, unknown>;
  date_triggered?: string;
};

// Dispatch on `ID`; `reference` holds the ids needed to fetch the record from the Simpro API
function handleSimproEvent(event: SimproEvent) {
  switch (event.ID) {
    case 'job.created':
      console.log(`Job created: ${event.description}`, event.reference);
      // TODO: Fetch the job via the Simpro API and sync it
      break;

    case 'company.customer.updated':
      console.log(`Customer updated: ${event.description}`, event.reference);
      // TODO: Fetch the customer and update your CRM
      break;

    case 'invoice.created':
      console.log(`Invoice created: ${event.description}`, event.reference);
      // TODO: Push to accounting
      break;

    case 'quote.updated':
      console.log(`Quote updated: ${event.description}`, event.reference);
      // TODO: Track quote status
      break;

    case 'employee.deleted':
      console.log(`Employee deleted: ${event.description}`, event.reference);
      // TODO: Revoke access in connected systems
      break;

    case 'test.updated':
      console.log('Simpro test subscription received');
      break;

    default:
      console.log(`Unhandled Simpro event: ${event.ID}`);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.SIMPRO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SIMPRO_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const signature = request.headers.get('x-response-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Response-Signature header' }, { status: 401 });
  }

  // Raw body for signature verification - don't use request.json() first
  const rawBody = await request.text();
  if (!verifySimproSignature(rawBody, signature, secret)) {
    console.error('Simpro webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after verification
  let event: SimproEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  handleSimproEvent(event);

  return NextResponse.json({ received: true });
}
