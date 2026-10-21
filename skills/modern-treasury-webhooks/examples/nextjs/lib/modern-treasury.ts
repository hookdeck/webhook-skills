import crypto from 'crypto';

/**
 * Verify the X-Signature header: lowercase hex HMAC-SHA256 of the RAW request
 * body, keyed with the webhook key as a plain UTF-8 string.
 */
export function verifySignature(
  rawBody: string,
  signature: string | null,
  webhookKey: string | undefined
): boolean {
  if (!signature || !webhookKey) return false;

  const expected = crypto
    .createHmac('sha256', webhookKey)
    .update(rawBody, 'utf8')
    .digest('hex');

  const received = Buffer.from(signature.trim().toLowerCase());
  const expectedBuf = Buffer.from(expected);

  // timingSafeEqual throws when lengths differ, so check first
  return received.length === expectedBuf.length &&
    crypto.timingSafeEqual(received, expectedBuf);
}

// Dispatch on "<topic>.<event>": the topic comes from the X-Topic header and
// the event name from the body's `event` field.
export function handleEvent(topic: string | null, event: string, data: Record<string, any>): void {
  switch (`${topic}.${event}`) {
    case 'payment_order.created':
    case 'payment_order.approved':
    case 'payment_order.begin_processing':
    case 'payment_order.finish_processing':
      console.log(`Payment order ${data.id} is ${event}`);
      break;
    case 'payment_order.completed':
      console.log(`Payment order ${data.id} completed (funds accepted by the bank)`);
      break;
    case 'payment_order.reconciled':
      console.log(`Payment order ${data.id} reconciled (settled)`);
      break;
    case 'payment_order.failed':
    case 'payment_order.returned':
      console.log(`Payment order ${data.id} ${event}`, data.status);
      break;
    case 'expected_payment.reconciled':
    case 'expected_payment.partially_reconciled':
    case 'expected_payment.overdue':
      console.log(`Expected payment ${data.id} ${event}`);
      break;
    case 'incoming_payment_detail.completed':
    case 'incoming_payment_detail.reconciled':
      console.log(`Incoming payment ${data.id} ${event}`);
      break;
    case 'transaction.created':
    case 'transaction.reconciled':
      console.log(`Transaction ${data.id} ${event}`);
      break;
    case 'return.created':
    case 'return.completed':
    case 'reversal.completed':
      console.log(`${topic} ${data.id} ${event}`);
      break;
    default:
      console.log(`Unhandled event: ${topic}.${event}`);
  }
}
