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

  // Extract version and signature
  const [version, signature] = webhookSignature.split(',');
  if (version !== 'v1') {
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

  // Timing-safe comparison to prevent timing attacks
  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    // Buffers have different lengths
    return false;
  }
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
      console.log(`Fine-tuned model: ${event.data.fine_tuned_model}`);
      // TODO: Deploy model, notify team, update database
      break;

    case 'fine_tuning.job.failed':
      console.log(`Fine-tuning job failed: ${event.data.id}`);
      console.log(`Error: ${event.data.error?.message}`);
      // TODO: Alert team, log error, retry if appropriate
      break;

    case 'fine_tuning.job.cancelled':
      console.log(`Fine-tuning job cancelled: ${event.data.id}`);
      // TODO: Clean up resources, update status
      break;

    case 'batch.completed':
      console.log(`Batch completed: ${event.data.id}`);
      console.log(`Output file: ${event.data.output_file_id}`);
      // TODO: Download results, process output, trigger next steps
      break;

    case 'batch.failed':
      console.log(`Batch failed: ${event.data.id}`);
      console.log(`Error: ${event.data.errors}`);
      // TODO: Handle errors, retry failed items
      break;

    case 'batch.cancelled':
      console.log(`Batch cancelled: ${event.data.id}`);
      // TODO: Clean up resources, update status
      break;

    case 'batch.expired':
      console.log(`Batch expired: ${event.data.id}`);
      // TODO: Clean up resources, handle timeout
      break;

    case 'realtime.call.incoming':
      console.log(`Realtime call incoming: ${event.data.id}`);
      // TODO: Handle incoming call, connect client
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  // Return 200 to acknowledge receipt
  return NextResponse.json({ received: true });
}