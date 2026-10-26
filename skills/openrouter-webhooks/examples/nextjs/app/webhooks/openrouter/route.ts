// Generated with: openrouter-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const HEX_64 = /^[0-9a-fA-F]{64}$/;

/**
 * Verify an X-OpenRouter-Signature header: t=<unix seconds>,v1=<hex>.
 * The v1 value is HMAC-SHA256 (hex) of the bytes "<t>," + raw body, keyed with
 * the workspace signing secret (UTF-8, used as-is).
 *
 * Timestamp tolerance is opt-in: Hookdeck retries and replays resend the
 * original timestamp, so a window is off unless toleranceSeconds > 0.
 */
function verifyOpenRouterSignature(
  rawBody: Buffer,
  header: string | null,
  secret: string | undefined,
  toleranceSeconds = 0
): boolean {
  if (!header || !secret) return false;

  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const p = part.trim();
    if (p.startsWith('t=')) {
      if (timestamp === null) timestamp = p.slice(2);
    } else if (p.startsWith('v1=')) {
      signatures.push(p.slice(3));
    }
  }
  if (!timestamp || signatures.length === 0) return false;

  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;
  }

  // Build the signed message as bytes: "<t>," + raw body (never a re-encoded string)
  const signedPayload = Buffer.concat([Buffer.from(`${timestamp},`, 'latin1'), rawBody]);
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest();

  // Validate format first (Buffer.from(x, 'hex') silently drops bad characters),
  // then compare equal-length buffers in constant time. Any matching v1 is valid.
  let valid = false;
  for (const sig of signatures) {
    if (!HEX_64.test(sig)) continue;
    if (crypto.timingSafeEqual(expected, Buffer.from(sig, 'hex'))) valid = true;
  }
  return valid;
}

export async function POST(request: NextRequest) {
  // Get the raw bytes for signature verification
  const rawBody = Buffer.from(await request.arrayBuffer());
  const tolerance = Number(process.env.OPENROUTER_WEBHOOK_TOLERANCE_SECONDS) || 0;

  if (!verifyOpenRouterSignature(
    rawBody,
    request.headers.get('x-openrouter-signature'),
    process.env.OPENROUTER_WEBHOOK_SECRET,
    tolerance
  )) {
    console.error('OpenRouter webhook verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after the signature check
  let event: { type?: string; data?: Record<string, any> };
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  // Deduplicate retries on this header (e.g. "<job id>-completed")
  const idempotencyKey = request.headers.get('x-openrouter-idempotency-key');
  const job = event.data ?? {};

  // Handle the event based on type
  switch (event.type) {
    case 'video.generation.completed':
      console.log('Video ready:', { id: job.id, idempotencyKey, url: job.unsigned_urls?.[0] });
      // TODO: Store the job and download the video (send your bearer token if the URL is on the OpenRouter API)
      break;

    case 'video.generation.failed':
      console.error('Video failed:', { id: job.id, idempotencyKey, error: job.error });
      // TODO: Mark the job failed and notify the user
      break;

    case 'video.generation.cancelled':
      console.log('Video cancelled:', { id: job.id, idempotencyKey });
      // TODO: Mark the job cancelled
      break;

    case 'video.generation.expired':
      console.log('Video expired:', { id: job.id, idempotencyKey });
      // TODO: Mark the job expired and resubmit if needed
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  // 204 acknowledges a valid delivery
  return new NextResponse(null, { status: 204 });
}
