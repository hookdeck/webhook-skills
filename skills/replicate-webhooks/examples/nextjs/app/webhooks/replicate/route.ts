import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify Replicate webhook signature
 */
function verifyReplicateSignature(
  body: Buffer,
  headers: Headers,
  secret: string
): boolean {
  const webhookId = headers.get('webhook-id');
  const webhookTimestamp = headers.get('webhook-timestamp');
  const webhookSignature = headers.get('webhook-signature');

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    throw new Error('Missing required webhook headers');
  }

  // Extract the key from the secret (remove 'whsec_' prefix)
  const key = Buffer.from(secret.split('_')[1], 'base64');

  // Create the signed content
  const signedContent = `${webhookId}.${webhookTimestamp}.${body.toString()}`;

  // Calculate expected signature
  const expectedSignature = crypto
    .createHmac('sha256', key)
    .update(signedContent)
    .digest('base64');

  // Parse signatures (can be multiple, space-separated)
  const signatures = webhookSignature.split(' ').map(sig => {
    // Handle format: v1,signature
    const parts = sig.split(',');
    return parts.length > 1 ? parts[1] : sig;
  });

  // Verify at least one signature matches
  const isValid = signatures.some(sig => {
    try {
      return crypto.timingSafeEqual(
        Buffer.from(sig),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false; // Different lengths = not equal
    }
  });

  // Verify timestamp is recent (prevent replay attacks)
  const timestamp = parseInt(webhookTimestamp, 10);
  const currentTime = Math.floor(Date.now() / 1000);
  if (currentTime - timestamp > 300) { // 5 minutes
    throw new Error('Timestamp too old');
  }

  return isValid;
}

/**
 * POST /webhooks/replicate
 * Handle incoming Replicate webhooks
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Get raw body
    const body = Buffer.from(await request.arrayBuffer());

    // Verify webhook signature
    const secret = process.env.REPLICATE_WEBHOOK_SECRET;
    if (!secret) {
      console.error('REPLICATE_WEBHOOK_SECRET not configured');
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      );
    }

    const isValid = verifyReplicateSignature(body, request.headers, secret);
    if (!isValid) {
      console.warn('Invalid webhook signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    // Parse the verified webhook body
    const prediction = JSON.parse(body.toString());
    console.log(`Received prediction webhook:`, {
      id: prediction.id,
      status: prediction.status,
      version: prediction.version,
      timestamp: new Date().toISOString()
    });

    // Handle the prediction based on its status
    switch (prediction.status) {
      case 'starting':
        console.log('Prediction starting:', {
          id: prediction.id,
          input: prediction.input,
          createdAt: prediction.created_at
        });
        // TODO: Update your database, notify users, etc.
        break;

      case 'processing':
        console.log('Prediction processing:', {
          id: prediction.id,
          logs: prediction.logs ? `${prediction.logs.length} log entries` : 'no logs yet'
        });
        // TODO: Store or display logs
        break;

      case 'succeeded':
        console.log('Prediction succeeded:', {
          id: prediction.id,
          output: Array.isArray(prediction.output)
            ? `Array with ${prediction.output.length} items`
            : typeof prediction.output,
          duration: prediction.metrics?.predict_time,
          urls: prediction.urls
        });
        // TODO: Process and store the output, send notifications, etc.
        break;

      case 'failed':
        console.log('Prediction failed:', {
          id: prediction.id,
          error: prediction.error
        });
        // TODO: Handle error, notify users, etc.
        break;

      case 'canceled':
        console.log('Prediction canceled:', {
          id: prediction.id
        });
        // TODO: Clean up resources, notify users, etc.
        break;

      default:
        console.log('Unknown prediction status:', prediction.status);
    }

    const processingTime = Date.now() - startTime;
    return NextResponse.json({
      received: true,
      predictionStatus: prediction.status,
      processingTime: `${processingTime}ms`
    });

  } catch (error) {
    console.error('Webhook processing error:', error);

    if (error instanceof Error) {
      if (error.message === 'Missing required webhook headers') {
        return NextResponse.json(
          { error: 'Missing required webhook headers' },
          { status: 400 }
        );
      }

      if (error.message === 'Timestamp too old') {
        return NextResponse.json(
          { error: 'Webhook timestamp too old' },
          { status: 400 }
        );
      }
    }

    // Don't expose internal errors
    return NextResponse.json(
      { error: 'Invalid webhook' },
      { status: 400 }
    );
  }
}

/**
 * GET /webhooks/replicate
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'Replicate webhook handler running',
    endpoint: '/webhooks/replicate',
    method: 'POST'
  });
}