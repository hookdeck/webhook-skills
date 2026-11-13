// Generated with: autotask-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify an Autotask webhook signature.
 *
 * Autotask sends `X-Hook-Signature: sha1=<base64>` where the value is
 * base64(HMAC_SHA1(secretKey, rawBody)). Keep the base64 `=` padding.
 */
function verifyAutotaskWebhook(rawBody: Buffer, header: string | null, secret: string): boolean {
  if (!header || !header.startsWith('sha1=')) return false;
  const received = header.slice('sha1='.length);
  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('base64');

  // Compare the base64 strings as equal-length buffers (no lenient base64 decode)
  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const secret = process.env.AUTOTASK_WEBHOOK_SECRET;
  if (!secret) {
    console.error('AUTOTASK_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw bytes BEFORE parsing so the signature matches exactly
  const rawBody = Buffer.from(await request.arrayBuffer());

  // Verify before trusting anything in the payload
  if (!verifyAutotaskWebhook(rawBody, request.headers.get('x-hook-signature'), secret)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Payload: { Action, Guid, EntityType, Id, Fields, EventTime, SequenceNumber, PersonID }
  const { Action: action, EntityType: entityType, Id: id, Fields: fields } = payload;
  console.log(`Received Autotask webhook: ${entityType} ${action}`);

  // Each webhook belongs to one entity (CompanyWebhooks, TicketWebhooks, ...), so
  // give each entity its own webhook URL and route on Action. Autotask's sample
  // shows EntityType "Account" for a company webhook; other values aren't printed.
  switch (action) {
    case 'Create':
      console.log(`${entityType} created:`, id, fields);
      // Add the new record to your system
      break;
    case 'Update':
      // Fields holds only the subscribed fields that changed
      console.log(`${entityType} updated:`, id, fields);
      break;
    case 'Delete':
      console.log(`${entityType} deleted:`, id);
      break;
    case 'Deactivated':
      // Sent to the DeactivationUrl: the webhook has stopped sending callouts
      console.log('Webhook deactivated:', payload.Guid);
      break;
    default:
      console.log(`Unhandled Autotask callout: ${entityType} ${action}`);
  }

  // Return 200 to acknowledge receipt
  return NextResponse.json({ received: true });
}
