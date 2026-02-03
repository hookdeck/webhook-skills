import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify Svix signature (used by Resend for webhooks)
 */
function verifySvixSignature(
  payload: string,
  headers: { 'svix-id': string; 'svix-timestamp': string; 'svix-signature': string },
  secret: string,
  tolerance: number = 300
): { valid: boolean; error?: string } {
  const msgId = headers['svix-id'];
  const msgTimestamp = headers['svix-timestamp'];
  const msgSignature = headers['svix-signature'];

  if (!msgId || !msgTimestamp || !msgSignature) {
    return { valid: false, error: 'Missing required headers' };
  }

  // Check timestamp tolerance (prevent replay attacks)
  const now = Math.floor(Date.now() / 1000);
  const timestamp = parseInt(msgTimestamp, 10);
  if (isNaN(timestamp) || Math.abs(now - timestamp) > tolerance) {
    return { valid: false, error: 'Timestamp outside tolerance' };
  }

  // Remove 'whsec_' prefix and decode secret
  const secretKey = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const secretBytes = Buffer.from(secretKey, 'base64');

  // Create signed content
  const signedContent = `${msgId}.${msgTimestamp}.${payload}`;

  // Compute expected signature
  const expectedSig = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');

  // Check against provided signatures (may have multiple versions)
  const signatures = msgSignature.split(' ');
  for (const sig of signatures) {
    if (sig.startsWith('v1,')) {
      const providedSig = sig.slice(3);
      try {
        if (crypto.timingSafeEqual(
          Buffer.from(providedSig),
          Buffer.from(expectedSig)
        )) {
          return { valid: true };
        }
      } catch {
        // Length mismatch, continue checking
      }
    }
  }

  return { valid: false, error: 'Invalid signature' };
}

export async function POST(request: NextRequest) {
  // Get the raw body for signature verification
  const body = await request.text();
  
  // Get Svix headers (used by Resend for webhooks)
  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: 'Missing webhook signature headers' },
      { status: 400 }
    );
  }

  // Verify the webhook signature
  const verification = verifySvixSignature(
    body,
    {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    },
    process.env.RESEND_WEBHOOK_SECRET!
  );

  if (!verification.valid) {
    console.error('Webhook signature verification failed:', verification.error);
    return NextResponse.json(
      { error: `Webhook Error: ${verification.error}` },
      { status: 400 }
    );
  }

  // Parse the event
  let event: { type: string; data: Record<string, unknown> };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON payload' },
      { status: 400 }
    );
  }

  // Handle the event based on type
  switch (event.type) {
    case 'email.sent':
      console.log('Email sent:', event.data.email_id);
      // TODO: Update email status in your database
      break;

    case 'email.delivered':
      console.log('Email delivered:', event.data.email_id);
      // TODO: Mark email as delivered, track delivery metrics
      break;

    case 'email.delivery_delayed':
      console.log('Email delivery delayed:', event.data.email_id);
      // TODO: Monitor for delivery issues
      break;

    case 'email.bounced':
      console.log('Email bounced:', event.data.email_id);
      // TODO: Handle bounce, possibly remove from mailing list
      break;

    case 'email.complained':
      console.log('Email marked as spam:', event.data.email_id);
      // TODO: Unsubscribe user, prevent future sends
      break;

    case 'email.opened':
      console.log('Email opened:', event.data.email_id);
      // TODO: Track engagement metrics
      break;

    case 'email.clicked':
      console.log('Email link clicked:', event.data.email_id);
      // TODO: Track click-through rates
      break;

    case 'email.received':
      console.log('Inbound email received:', event.data.email_id);
      // TODO: Process inbound email (call API to get body/attachments)
      // const { data: email } = await resend.emails.receiving.get(event.data.email_id as string);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  // Return 200 to acknowledge receipt
  return NextResponse.json({ received: true });
}
