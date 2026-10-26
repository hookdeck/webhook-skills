// Generated with: configcat-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyConfigCatWebhook } from '../../../lib/verify';

async function handle(request: NextRequest) {
  const secret = process.env.CONFIGCAT_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CONFIGCAT_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes for any content type (empty for GET): the signature covers the exact body
  const rawBody = Buffer.from(await request.arrayBuffer());
  const webhookId = request.headers.get('x-configcat-webhook-id');

  const result = verifyConfigCatWebhook({
    rawBody,
    webhookId,
    timestamp: request.headers.get('x-configcat-webhook-timestamp'),
    signature: request.headers.get('x-configcat-webhook-signature-v1'),
    secret,
    toleranceSeconds: Number(process.env.CONFIGCAT_WEBHOOK_TOLERANCE_SECONDS) || 0,
  });
  if (!result.valid) {
    console.error(`Webhook verification failed: ${result.error}`);
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  // ConfigCat has no event types: the body is whatever template the webhook author wrote
  // (optional), e.g. {"config":"##ConfigName##","environment":"##EnvironmentName##"}.
  // Parse only after verification: JSON if it parses, else text, or empty.
  const text = rawBody.toString('utf8');
  let body: unknown = text || null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // plain text body
  }

  console.log(`ConfigCat settings changed (${request.method}, webhook ${webhookId})`, body);
  // TODO: refresh your ConfigCat client, invalidate caches, notify your team
  // Don't dedupe on X-ConfigCat-Webhook-ID: it is different for every request, including
  // ConfigCat's retries (up to 5). Keep this idempotent, e.g. refresh state rather than apply deltas.

  return NextResponse.json({ received: true });
}

// ConfigCat webhooks use GET or POST (user-set); the others are accepted too
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
