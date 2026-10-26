// Generated with: bump-sh-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Bump.sh webhook signature.
 *
 * Bump.sh sends `X-Bump-Signature-256: sha256=<hex>` where <hex> is the
 * lowercase hex HMAC-SHA256 of the raw request body, keyed with the webhook's
 * secret token (used as UTF-8 bytes). Only the body is signed, so there is no
 * timestamp to check. A bare 64-hex value (no prefix) is accepted too.
 */
function verifyBumpSignature(
  rawBody: Buffer,
  header: string | null,
  secret: string | undefined
): boolean {
  if (!secret || !header) return false;

  const signature = header.startsWith('sha256=') ? header.slice('sha256='.length) : header;

  // Validate length and alphabet before decoding: Buffer.from(x, 'hex')
  // silently drops invalid characters.
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature, 'hex');

  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export async function POST(request: NextRequest) {
  const secret = process.env.BUMP_SH_WEBHOOK_SECRET;
  if (!secret) {
    console.error('BUMP_SH_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes: the signature covers the body exactly as received.
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyBumpSignature(rawBody, request.headers.get('x-bump-signature-256'), secret)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after the signature is verified.
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!isObject(payload)) {
    return NextResponse.json({ error: 'Unexpected payload' }, { status: 400 });
  }

  // Bump.sh has a single notification (a documentation structure change) with
  // body { api, diff } and no event-name field. Check types before reading in.
  const api = isObject(payload.api) ? payload.api : null;
  const diff = isObject(payload.diff) ? payload.diff : null;

  console.log('Bump.sh documentation structure change received', {
    apiKeys: api ? Object.keys(api) : null,
    diffKeys: diff ? Object.keys(diff) : null,
  });
  // TODO: post to chat, open a ticket, regenerate SDKs, notify API consumers, etc.

  return NextResponse.json({ received: true });
}
