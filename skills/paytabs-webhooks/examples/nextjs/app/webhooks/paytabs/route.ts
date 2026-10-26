import { NextRequest, NextResponse } from 'next/server';
import { verifyPayTabsSignature } from '../../../lib/verify';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export async function POST(request: NextRequest) {
  // Raw body is required: the signature covers the exact bytes PayTabs sent
  const rawBody = Buffer.from(await request.arrayBuffer());

  const signature = request.headers.get('signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature header' }, { status: 401 });
  }
  if (!verifyPayTabsSignature(rawBody, signature, process.env.PAYTABS_WEBHOOK_SECRET)) {
    console.error('PayTabs webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after verification, and treat every field as untrusted
  let transaction: unknown;
  try {
    transaction = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!isObject(transaction)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // There is no event name: every callback/IPN is the full transaction.
  // tran_type is the transaction type; payment_result.response_status is the outcome.
  const tranType = typeof transaction.tran_type === 'string' ? transaction.tran_type : undefined;
  const tranRef = typeof transaction.tran_ref === 'string' ? transaction.tran_ref : undefined;
  const result = isObject(transaction.payment_result) ? transaction.payment_result : {};
  const status = typeof result.response_status === 'string' ? result.response_status : undefined;

  if (status === 'A') {
    switch (tranType) {
      case 'Sale':
        console.log('Sale authorised:', tranRef);
        break;
      case 'Refund':
        console.log('Refund authorised:', tranRef);
        break;
      default:
        console.log('Transaction authorised:', tranType, tranRef);
    }
  } else {
    console.log('Transaction not authorised:', tranType, tranRef, status, result.response_message);
  }

  // IPN fires on every create or change, so dedupe on tran_ref plus status
  return NextResponse.json({ received: true });
}
