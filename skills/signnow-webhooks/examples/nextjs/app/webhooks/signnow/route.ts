// Generated with: signnow-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

/**
 * SIGNNOW WEBHOOK VERIFICATION
 *
 * SignNow signs a callback only when the event subscription was created with a
 * `secret_key` (any string up to 300 chars). X-SignNow-Signature is then the
 * base64 HMAC-SHA256 of the raw request body, keyed with that secret as UTF-8.
 * There is no timestamp in the signed content.
 */
export function verifySignNowSignature(
  rawBody: string | Buffer,
  signature: string | null | undefined,
  secret: string | null | undefined
): boolean {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(rawBody).digest('base64');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // Length guard first: timingSafeEqual throws on mismatched lengths.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const secret = process.env.SIGNNOW_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SIGNNOW_WEBHOOK_SECRET is not set - refusing unverified webhooks');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const signature = request.headers.get('x-signnow-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing X-SignNow-Signature header' }, { status: 400 });
  }

  // Raw body: read as text before any JSON parsing, whatever the Content-Type.
  const rawBody = await request.text();

  if (!verifySignNowSignature(rawBody, signature, secret)) {
    console.error('SignNow webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.log(`✓ Verified SignNow webhook: ${payload?.meta?.event ?? 'unknown'}`);

  handleEvent(payload);

  return NextResponse.json({ received: true });
}

function handleEvent(payload: any) {
  // meta.event is the event name; content holds the entity ids.
  // TODO: dedupe (e.g. on meta.event + content id + meta.timestamp); SignNow retries failed deliveries.
  const meta = payload?.meta ?? {};
  const content = payload?.content ?? {};

  switch (meta.event) {
    case 'document.open':
      console.log(`👀 Document opened: ${content.document_id}`);
      break;
    case 'document.update':
      console.log(`✏️  Document updated: ${content.document_id}`);
      break;
    case 'document.complete':
      console.log(`✅ Document complete: ${content.document_id} (${content.document_name})`);
      break;
    case 'document.delete':
      console.log(`🗑️  Document deleted: ${content.document_id}`);
      break;
    case 'document.fieldinvite.sent':
      console.log(`📨 Field invite sent for document ${content.document_id}`);
      break;
    case 'document.fieldinvite.signed':
      console.log(`🖊️  Field invite signed for document ${content.document_id}`);
      break;
    case 'document.fieldinvite.decline':
      console.log(`🚫 Field invite declined for document ${content.document_id}`);
      break;
    case 'user.document.complete':
      console.log(`✅ User ${content.user_id}'s document complete: ${content.document_id}`);
      break;
    case 'document_group.complete':
      console.log(`✅ Document group complete: ${content.group_id}`);
      break;
    case 'document_group.invite.signer.complete':
      console.log(`✅ Signer ${content.signer_email} finished group ${content.group_id}`);
      break;
    default:
      console.log(`Unhandled SignNow event: ${meta.event}`);
  }
}
