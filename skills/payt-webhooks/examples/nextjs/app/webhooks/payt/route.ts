// Generated with: payt-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyPaytSignature, type PaytEvent } from '../../../lib/verify-payt';

// The body is { event: { event_name, context, event_time } }: dispatch on event.event_name.
function handleEvent(eventName: string, context: Record<string, any>): void {
  const debtor = context.debtor || {};

  switch (eventName) {
    case 'invoice_created':
      console.log(`Invoice ${context.invoice_number} created for ${debtor.name} (open: ${context.amount_open} ${context.currency_code})`);
      // TODO: sync the new invoice to your system
      break;

    case 'invoice_paid':
    case 'invoice_closed':
      console.log(`Invoice ${context.invoice_number} ${eventName === 'invoice_paid' ? 'paid' : 'closed'}`);
      // TODO: mark the invoice as settled
      break;

    case 'invoice_payment_created':
      // book_amount is the amount in the administration's bookkeeping currency
      console.log(`Payment ${context.id} of ${context.amount} ${context.currency_code} on invoice ${context.invoice?.invoice_number}`);
      // TODO: book the payment in your accounting system
      break;

    case 'case_created':
      console.log(`Debt collection case ${context.credit_case_number} created with ${(context.invoices || []).length} invoice(s)`);
      // TODO: flag the debtor's invoices as in collection
      break;

    case 'case_paid':
      console.log(`Debt collection case ${context.credit_case_number} fully paid`);
      break;

    case 'bundled_reminder_sent':
      console.log(`Bundled reminder ${context.id} sent as ${context.sent_as_format} (${(context.invoices || []).length} invoice(s))`);
      break;

    case 'payment_plan_created':
      console.log(`Payment plan ${context.id} created for ${debtor.name}`);
      break;

    case 'credit_limit_exceeded':
      console.log(`Credit limit exceeded for debtor ${context.debtor_code} (${context.book_open_amount} open of ${context.credit_limit_amount})`);
      // TODO: alert your credit controller
      break;

    case 'psp_transaction_successful':
      console.log(`PSP transaction registered on invoice ${context.invoice_number}`);
      break;

    default:
      console.log(`Unhandled Payt event: ${eventName}`);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.PAYT_WEBHOOK_SECRET;
  if (!secret) {
    console.error('PAYT_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the exact bytes: never request.json() or request.text() before verifying
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyPaytSignature(rawBody, request.headers.get('x-payt-signature'), secret)) {
    return NextResponse.json({ error: 'Invalid or missing signature' }, { status: 401 });
  }

  let body: { event?: PaytEvent } | null;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const event = body?.event;
  if (!event || typeof event.event_name !== 'string') {
    return NextResponse.json({ error: 'Missing event.event_name' }, { status: 400 });
  }

  // Delivery is at least once and unordered: make processing idempotent. For an unknown
  // object Payt suggests answering 404 so it retries later.
  try {
    handleEvent(event.event_name, event.context && typeof event.context === 'object' ? event.context : {});
  } catch (err) {
    console.error('Error handling Payt webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  // Payt needs a 200 within 10 seconds, otherwise the delivery is retried
  return NextResponse.json({ received: true });
}
