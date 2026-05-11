// Generated with: gemini-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verify a Gemini webhook signature (Standard Webhooks, HMAC-SHA256).
 */
function verifyGeminiSignature(
  payload: string,
  webhookId: string | null,
  webhookTimestamp: string | null,
  webhookSignature: string | null,
  secret: string
): boolean {
  if (!webhookId || !webhookTimestamp || !webhookSignature || !webhookSignature.includes(',')) {
    return false;
  }

  // Reject payloads older than 5 minutes (Standard Webhooks default)
  const currentTime = Math.floor(Date.now() / 1000);
  const timestampDiff = currentTime - parseInt(webhookTimestamp);
  if (timestampDiff > 300 || timestampDiff < -300) {
    console.error('Webhook timestamp too old or too far in the future');
    return false;
  }

  const [version, signature] = webhookSignature.split(',');
  if (version !== 'v1') {
    return false;
  }

  // Signed content: webhook_id.webhook_timestamp.raw_body
  const signedContent = `${webhookId}.${webhookTimestamp}.${payload}`;

  // Strip whsec_ prefix and base64-decode the key
  const secretKey = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const secretBytes = Buffer.from(secretKey, 'base64');

  const expectedSignature = createHmac('sha256', secretBytes)
    .update(signedContent, 'utf8')
    .digest('base64');

  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Read the raw body — JSON parsing would change the bytes and break the signature.
  const rawBody = await request.text();
  const webhookId = request.headers.get('webhook-id');
  const webhookTimestamp = request.headers.get('webhook-timestamp');
  const webhookSignature = request.headers.get('webhook-signature');
  const webhookSecret = process.env.GEMINI_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('GEMINI_WEBHOOK_SECRET environment variable not set');
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  if (!verifyGeminiSignature(rawBody, webhookId, webhookTimestamp, webhookSignature, webhookSecret)) {
    console.error('Gemini webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    console.error('Failed to parse webhook payload:', err);
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  switch (event.type) {
    case 'batch.succeeded':
      console.log(`Batch succeeded: ${event.data.id}`);
      console.log(`Output: ${event.data.output_file_uri}`);
      // TODO: Download output, fan out results
      break;

    case 'batch.failed':
      console.log(`Batch failed: ${event.data.id}`);
      console.log(`Error: ${event.data.error_code} ${event.data.error_message}`);
      // TODO: Alert team, decide whether to retry
      break;

    case 'batch.cancelled':
      console.log(`Batch cancelled: ${event.data.id}`);
      // TODO: Clean up resources, update status
      break;

    case 'batch.expired':
      console.log(`Batch expired: ${event.data.id}`);
      // TODO: Resubmit or surface to user
      break;

    case 'video.generated':
      console.log(`Video generated: ${event.data.id}`);
      console.log(`Video file: ${event.data.file_name || event.data.output_file_uri}`);
      // TODO: Fetch the rendered video, notify the user
      break;

    case 'interaction.completed':
      console.log(`Interaction completed: ${event.data.id}`);
      // TODO: Consume LRO result, continue flow
      break;

    case 'interaction.requires_action':
      console.log(`Interaction requires action: ${event.data.id}`);
      // TODO: Run the requested function call, submit the result back
      break;

    case 'interaction.failed':
      console.log(`Interaction failed: ${event.data.id}`);
      console.log(`Error: ${event.data.error_code} ${event.data.error_message}`);
      // TODO: Surface error to user
      break;

    case 'interaction.cancelled':
      console.log(`Interaction cancelled: ${event.data.id}`);
      // TODO: Update UI / state
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
