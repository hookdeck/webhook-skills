// Generated with: linear-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Linear's recommended replay-protection window for `webhookTimestamp`.
const WEBHOOK_TIMESTAMP_TOLERANCE_MS = 60 * 1000;

/**
 * Verify a Linear webhook signature.
 *
 * Linear sends a hex-encoded HMAC-SHA256 of the raw request body in the
 * `Linear-Signature` header — no `sha256=` prefix.
 */
export function verifyLinearWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

export function isFreshTimestamp(
  webhookTimestamp: unknown,
  now: number = Date.now()
): boolean {
  if (typeof webhookTimestamp !== 'number') {
    return false;
  }
  return Math.abs(now - webhookTimestamp) <= WEBHOOK_TIMESTAMP_TOLERANCE_MS;
}

export async function POST(request: NextRequest) {
  // Read the raw body — `request.json()` would parse, breaking signature
  // verification because of whitespace/key-ordering normalisation.
  const body = await request.text();
  const signature = request.headers.get('linear-signature');
  const event = request.headers.get('linear-event');
  const deliveryId = request.headers.get('linear-delivery');

  if (!verifyLinearWebhook(body, signature, process.env.LINEAR_WEBHOOK_SECRET ?? '')) {
    console.error('Linear webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!isFreshTimestamp(payload.webhookTimestamp)) {
    console.error('Linear webhook timestamp is outside the 1 minute window');
    return NextResponse.json({ error: 'Stale webhook' }, { status: 400 });
  }

  const action = payload.action as string | undefined;
  const data = payload.data as Record<string, unknown> | undefined;

  console.log(`Received Linear ${event} ${action} (delivery: ${deliveryId})`);

  switch (event) {
    case 'Issue':
      console.log(`Issue ${action}: ${data?.title ?? ''}`);
      break;
    case 'Comment':
      console.log(`Comment ${action} on issue ${data?.issueId ?? ''}`);
      break;
    case 'IssueLabel':
      console.log(`Label ${action}: ${data?.name ?? ''}`);
      break;
    case 'Project':
      console.log(`Project ${action}: ${data?.name ?? ''}`);
      break;
    case 'ProjectUpdate':
      console.log(`Project update ${action} on project ${data?.projectId ?? ''}`);
      break;
    case 'Cycle':
      console.log(`Cycle ${action}: ${data?.name ?? data?.number ?? ''}`);
      break;
    case 'Reaction':
      console.log(`Reaction ${action} (${data?.emoji ?? ''})`);
      break;
    case 'IssueSLA':
      console.log(
        `SLA event on issue ${(payload.issueData as { id?: string } | undefined)?.id ?? ''}`
      );
      break;
    case 'OAuthAppRevoked':
      console.log(`OAuth app revoked: ${payload.oauthClientId ?? ''}`);
      break;
    default:
      console.log(`Unhandled Linear event: ${event}`);
  }

  return NextResponse.json({ received: true });
}
