// Generated with: opnform-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// OpnForm signs deliveries only when a webhook secret is set on the integration:
//   X-Webhook-Signature: sha256=<lowercase hex HMAC-SHA256 of the raw body>
// The key is the secret as UTF-8 bytes. Nothing else is signed (no timestamp), so there is no
// replay window; use submission_id for idempotency.
// https://docs.opnform.com/api-reference/integrations/webhook-security

function verifyOpnform(rawBody: Buffer, signatureHeader: string | null, secret: string): boolean {
  if (!secret || !signatureHeader) return false;

  // The prefix is optional: Hookdeck's OpnForm source accepts the bare digest too
  let sig = signatureHeader.trim();
  if (sig.startsWith('sha256=')) sig = sig.slice('sha256='.length);
  // Buffer.from(x, 'hex') silently drops invalid characters, so check the shape first.
  if (!/^[0-9a-fA-F]{64}$/.test(sig)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected);
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export async function POST(request: NextRequest) {
  const secret = process.env.OPNFORM_WEBHOOK_SECRET;
  if (!secret) {
    console.error('OPNFORM_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes: read before any JSON parsing, so any content type is verified as sent
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyOpnform(rawBody, request.headers.get('x-webhook-signature'), secret)) {
    console.error('OpnForm webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  // Signed does not mean well-formed: the fields come from whoever filled in the form
  if (!isObject(payload)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Every delivery is a form submission; there is no event name to switch on.
  // submission_id identifies it: use it to drop duplicates (see webhook-handler-patterns)
  const { form_id, form_title, submission_id, submission } = payload;
  const fieldCount = isObject(submission) ? Object.keys(submission).length : 0;
  const title = typeof form_title === 'string' ? form_title : 'unknown form';
  const formId = typeof form_id === 'number' || typeof form_id === 'string' ? form_id : '?';
  const submissionId =
    typeof submission_id === 'number' || typeof submission_id === 'string' ? submission_id : '?';

  console.log(`Form submission ${submissionId} on "${title}" (form ${formId}): ${fieldCount} fields`);

  return NextResponse.json({ received: true });
}
