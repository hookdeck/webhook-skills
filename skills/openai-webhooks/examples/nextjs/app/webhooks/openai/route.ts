// Generated with: openai-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verify OpenAI webhook signature using Standard Webhooks
 */
function verifyOpenAISignature(
  payload: string,
  webhookId: string | null,
  webhookTimestamp: string | null,
  webhookSignature: string | null,
  secret: string
): boolean {
  if (!webhookId || !webhookTimestamp || !webhookSignature || !webhookSignature.includes(',')) {
    return false;
  }

  // Check timestamp is within 5 minutes to prevent replay attacks
  const currentTime = Math.floor(Date.now() / 1000);
  const timestampDiff = currentTime - parseInt(webhookTimestamp);
  if (timestampDiff > 300 || timestampDiff < -300) {
    console.error('Webhook timestamp too old or too far in the future');
    return false;
  }

  // The header holds one or more space-delimited "v1,<base64>" entries
  // (several while an old secret is still valid). Accept a match on any.
  const signatures = webhookSignature
    .split(' ')
    .filter((entry) => entry.startsWith('v1,'))
    .map((entry) => entry.slice(3));
  if (signatures.length === 0) {
    return false;
  }

  // Create signed content: webhook_id.webhook_timestamp.payload
  const signedContent = `${webhookId}.${webhookTimestamp}.${payload}`;

  // Decode base64 secret (remove whsec_ prefix if present)
  const secretKey = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const secretBytes = Buffer.from(secretKey, 'base64');

  // Generate expected signature
  const expectedSignature = createHmac('sha256', secretBytes)
    .update(signedContent, 'utf8')
    .digest('base64');

  // Timing-safe comparison against each entry
  const expected = Buffer.from(expectedSignature);
  return signatures.some((signature) => {
    const received = Buffer.from(signature);
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}

export async function POST(request: NextRequest) {
  // Get raw body as text for signature verification
  const rawBody = await request.text();
  const webhookId = request.headers.get('webhook-id');
  const webhookTimestamp = request.headers.get('webhook-timestamp');
  const webhookSignature = request.headers.get('webhook-signature');
  const webhookSecret = process.env.OPENAI_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('OPENAI_WEBHOOK_SECRET environment variable not set');
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  // Verify webhook signature
  if (!verifyOpenAISignature(rawBody, webhookId, webhookTimestamp, webhookSignature, webhookSecret)) {
    console.error('OpenAI webhook signature verification failed');
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    );
  }

  // Parse the verified payload
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    console.error('Failed to parse webhook payload:', err);
    return NextResponse.json(
      { error: 'Invalid JSON payload' },
      { status: 400 }
    );
  }

  // Handle the event based on type
  switch (event.type) {
    case 'fine_tuning.job.succeeded':
      console.log(`Fine-tuning job succeeded: ${event.data.id}`);
      // Your code: retrieve the job with client.fineTuning.jobs.retrieve(event.data.id)
      break;

    case 'fine_tuning.job.failed':
      console.log(`Fine-tuning job failed: ${event.data.id}`);
      // Your code: retrieve the job for its error, alert the team
      break;

    case 'fine_tuning.job.cancelled':
      console.log(`Fine-tuning job cancelled: ${event.data.id}`);
      // Your code: Clean up resources, update status
      break;

    case 'batch.completed':
      console.log(`Batch completed: ${event.data.id}`);
      // Your code: retrieve the batch with client.batches.retrieve(event.data.id) for its output file
      break;

    case 'batch.failed':
      console.log(`Batch failed: ${event.data.id}`);
      // Your code: retrieve the batch for its errors
      break;

    case 'batch.cancelled':
      console.log(`Batch cancelled: ${event.data.id}`);
      // Your code: Clean up resources, update status
      break;

    case 'batch.expired':
      console.log(`Batch expired: ${event.data.id}`);
      // Your code: Clean up resources, handle timeout
      break;

    case 'realtime.call.incoming':
      console.log(`Realtime call incoming: ${event.data.call_id}`);
      // Your code: accept or reject the call with data.call_id
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  // Return 200 to acknowledge receipt
  return NextResponse.json({ received: true });
}