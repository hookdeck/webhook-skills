// Generated with: alipay-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { ACK_BODY, verifyAlipaySignature } from '@/lib/verify';

// Ensure the Node.js runtime (needs the `crypto` module for RSA).
export const runtime = 'nodejs';

const CLIENT_ID = process.env.ALIPAY_CLIENT_ID || '';
const ALIPAY_PUBLIC_KEY = process.env.ALIPAY_PUBLIC_KEY || ''; // verifies inbound

const WEBHOOK_PATH = '/webhooks/alipay';

// The SUCCESS ack. Antom resends the notification until it gets this fixed
// body; the acknowledgement needs no signature.
function ack() {
  return new NextResponse(ACK_BODY, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Client-Id': CLIENT_ID,
      'Response-Time': new Date().toISOString(),
    },
  });
}

// The event type sits in a different field per notification API.
function notificationType(event: any): string | null {
  return (
    event.notifyType || // notifyPayment, notifyCapture, notifyRefund, notifyReversal
    event.authorizationNotifyType || // notifyAuthorization
    event.disputeNotificationType || // notifyDispute
    event.subscriptionNotificationType || // notifySubscription
    null // notifyVaulting and the subscription notifyPayment carry no type
  );
}

export async function POST(req: NextRequest) {
  // Read the RAW body — the signature covers the exact bytes. Do not use req.json().
  const rawBody = await req.text();

  const clientId = req.headers.get('client-id');
  const requestTime = req.headers.get('request-time');
  const signatureHeader = req.headers.get('signature');

  if (!signatureHeader || !clientId || !requestTime) {
    return new NextResponse('Missing Alipay signature headers', { status: 400 });
  }

  const valid = verifyAlipaySignature({
    method: 'POST',
    uri: WEBHOOK_PATH,
    clientId,
    requestTime,
    rawBody,
    signatureHeader,
    publicKey: ALIPAY_PUBLIC_KEY,
  });

  if (!valid) {
    return new NextResponse('Invalid signature', { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  // `result.resultStatus` is S (success) or F (failure) where a body has it.
  const status = event?.result?.resultStatus;
  const type = notificationType(event);

  switch (type) {
    case 'PAYMENT_RESULT':
      // Final result. Deduplicate on notifyType + paymentId; only S means paid.
      console.log('Payment result:', event.paymentRequestId, event.paymentId, status);
      // Your code: if (status === 'S') fulfill the order
      break;
    case 'PAYMENT_PENDING':
      // The buyer has paid; wait for PAYMENT_RESULT. Never overwrite a final result.
      console.log('Payment pending:', event.paymentRequestId, event.paymentId);
      break;
    case 'CAPTURE_RESULT':
      console.log('Capture result:', event.captureRequestId, event.captureId, status);
      break;
    case 'REFUND_RESULT':
      console.log('Refund result:', event.refundRequestId, event.refundId, event.refundStatus);
      break;
    case 'AUTHCODE_CREATED':
      // Exchange event.authCode for an access token with applyToken.
      console.log('Authorization code created:', event.authState);
      break;
    case 'TOKEN_CREATED':
    case 'TOKEN_CANCELED':
      console.log('Authorization:', type, event.authState);
      break;
    case 'DISPUTE_CREATED':
    case 'DEFENSE_DUE_ALERT':
    case 'DISPUTE_JUDGED':
      console.log('Dispute:', type, event.disputeId, event.paymentId);
      break;
    default:
      // Acknowledge types you don't handle too, or Antom keeps resending them.
      console.log('Unhandled notification type:', type);
  }

  // The fixed body so Antom stops resending.
  return ack();
}
