import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Verify Cursor webhook signature
function verifyCursorWebhook(
  rawBody: Buffer,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  // Cursor sends: sha256=xxxx
  const parts = signatureHeader.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256') {
    return false;
  }

  const signature = parts[1];
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false; // Different lengths
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get raw body
    const rawBody = await request.arrayBuffer();
    const body = Buffer.from(rawBody);

    // Extract headers
    const signature = request.headers.get('x-webhook-signature');
    const webhookId = request.headers.get('x-webhook-id');
    const event = request.headers.get('x-webhook-event');
    const userAgent = request.headers.get('user-agent');

    console.log(`Received webhook: ${event} (ID: ${webhookId})`);

    // Verify signature
    const secret = process.env.CURSOR_WEBHOOK_SECRET;
    if (!secret) {
      console.error('CURSOR_WEBHOOK_SECRET not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    if (!verifyCursorWebhook(body, signature, secret)) {
      console.error('Signature verification failed');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Parse the payload after verification
    let payload: any;
    try {
      payload = JSON.parse(body.toString());
    } catch (error) {
      console.error('Failed to parse payload:', error);
      return NextResponse.json(
        { error: 'Invalid payload' },
        { status: 400 }
      );
    }

    // Handle the event
    if (event === 'statusChange') {
      console.log(`Agent ${payload.id} status changed to: ${payload.status}`);
      console.log(`Timestamp: ${payload.timestamp}`);

      if (payload.source) {
        console.log(`Repository: ${payload.source.repository}`);
        console.log(`Ref: ${payload.source.ref}`);
      }

      if (payload.target) {
        console.log(`Target URL: ${payload.target.url}`);
        console.log(`Branch: ${payload.target.branchName}`);
        if (payload.target.prUrl) {
          console.log(`PR URL: ${payload.target.prUrl}`);
        }
      }

      if (payload.status === 'FINISHED') {
        console.log(`Summary: ${payload.summary}`);
        // Handle successful completion
        // e.g., update database, notify users, trigger CI/CD
      } else if (payload.status === 'ERROR') {
        console.error(`Agent error for ${payload.id}`);
        // Handle error case
        // e.g., send alerts, retry logic
      }
    }

    // Always respond quickly to webhooks
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}