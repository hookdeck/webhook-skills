// Generated with: bolt-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Bolt sends base64(HMAC-SHA256(rawBody, signingSecret)) in X-Bolt-Hmac-Sha256
function verifyBoltWebhook(rawBody: string, hmacHeader: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hmacHeader));
  } catch {
    return false; // Different lengths = invalid
  }
}

export async function POST(request: NextRequest) {
  // Use the raw text body - parsing JSON first would change the signed bytes
  const rawBody = await request.text();
  const signature = request.headers.get('x-bolt-hmac-sha256');
  const secret = process.env.BOLT_SIGNING_SECRET;

  if (!signature) {
    return new NextResponse('Missing X-Bolt-Hmac-Sha256 header', { status: 400 });
  }

  if (!secret || !verifyBoltWebhook(rawBody, signature, secret)) {
    console.error('Bolt webhook signature verification failed');
    return new NextResponse('Invalid signature', { status: 400 });
  }

  let event: { type?: string; object?: string; data?: any };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  // Bolt has no event ID; dedupe on type + transaction id before side effects
  const data = event.data ?? {};
  console.log(`Received Bolt ${event.type} webhook (${event.object})`);

  switch (event.type) {
    case 'pending':
      console.log('Transaction pending fraud review:', data.reference);
      break;
    case 'payment':
      console.log('Payment captured:', data.reference, data.amount);
      // TODO: Mark order as paid (automatic capture)
      break;
    case 'auth':
      console.log('Transaction authorized:', data.reference);
      // TODO: Begin the capture process (manual capture)
      break;
    case 'capture':
      console.log('Manual capture succeeded:', data.reference);
      break;
    case 'credit':
      console.log('Refund processed:', data.reference);
      break;
    case 'void':
      console.log('Transaction voided:', data.reference);
      break;
    case 'failed_payment':
      console.log('Payment failed pre-authorization:', data.reference);
      break;
    case 'rejected_irreversible':
      console.log('Transaction permanently rejected:', data.reference);
      break;
    case 'rejected_reversible':
      console.log('Transaction rejected (re-review possible):', data.reference);
      break;
    case 'risk_insights':
      console.log('Risk insights available:', data.reference);
      break;
    case 'newsletter_subscription':
      console.log('Newsletter subscription:', data.reference);
      break;
    case 'credit_card_deleted':
      console.log('Saved credit card deleted (beta):', data.user?.id);
      break;
    default:
      console.log(`Unhandled Bolt event type: ${event.type}`);
  }

  // Return 200 with a JSON body; non-200 or non-JSON responses are retried
  return NextResponse.json({ received: true });
}
