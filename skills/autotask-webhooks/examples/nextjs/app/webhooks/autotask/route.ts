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

  switch (entityType) {
    case 'Company':
      if (action === 'Create') console.log('Company created:', id, fields);
      else if (action === 'Update') console.log('Company updated:', id, fields);
      else if (action === 'Delete') console.log('Company deleted:', id);
      // TODO: Sync companies to CRM, billing, etc.
      break;

    case 'Contact':
      if (action === 'Create') console.log('Contact created:', id, fields);
      else if (action === 'Update') console.log('Contact updated:', id, fields);
      else if (action === 'Delete') console.log('Contact deleted:', id);
      // TODO: Sync contacts to marketing or CRM tools
      break;

    case 'Ticket':
      if (action === 'Create') console.log('Ticket created:', id, fields);
      else if (action === 'Update') console.log('Ticket updated:', id, fields);
      else if (action === 'Delete') console.log('Ticket deleted:', id);
      // TODO: Alert on-call, mirror to chat, etc.
      break;

    case 'TicketNote':
      if (action === 'Create') console.log('Ticket note created:', id, fields);
      else if (action === 'Update') console.log('Ticket note updated:', id, fields);
      else if (action === 'Delete') console.log('Ticket note deleted:', id);
      // TODO: Notify watchers, sync notes, etc.
      break;

    default:
      // Other entities, or Deactivated callouts (webhook disabled or deleted)
      console.log(`Unhandled Autotask webhook: ${entityType} ${action}`);
  }

  // Return 200 to acknowledge receipt
  return NextResponse.json({ received: true });
}
