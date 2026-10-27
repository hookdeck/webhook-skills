// Generated with: prividium-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

export const dynamic = 'force-dynamic';

// webhook-id is stable across retries. This in-memory set is for illustration only:
// persist ids in durable storage before applying side effects in production.
const processedIds = new Set<string>();

// Prividium sends webhook-* headers; Hookdeck also reads the svix-* names when webhook-id is absent
function readSignatureHeaders(headers: Headers) {
  const prefix = headers.get('webhook-id') ? 'webhook' : 'svix';
  return {
    'webhook-id': headers.get(`${prefix}-id`),
    'webhook-timestamp': headers.get(`${prefix}-timestamp`),
    'webhook-signature': headers.get(`${prefix}-signature`),
  };
}

// PRIVIDIUM_WEBHOOK_SECRET is the full whsec_ value. During a key rotation you may list the old and
// new keys separated by commas; a delivery passes if any one of them verifies it.
function readSecrets(): string[] | null {
  const secrets = (process.env.PRIVIDIUM_WEBHOOK_SECRET ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return secrets.length > 0 && secrets.every((s) => s.startsWith('whsec_')) ? secrets : null;
}

export async function POST(request: Request) {
  const secrets = readSecrets();
  if (!secrets) {
    console.error('PRIVIDIUM_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature } =
    readSignatureHeaders(request.headers);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Prividium signed
  const rawBody = await request.text();

  // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
  // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
  const headers = { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature };
  let lastError: unknown;
  const verified = secrets.some((secret) => {
    try {
      new Webhook(secret).verify(rawBody, headers, { jsonParse: false });
      return true;
    } catch (err) {
      lastError = err;
      return false;
    }
  });
  if (!verified) {
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    console.error('Prividium webhook verification failed:', message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  if (processedIds.has(id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // The body format is not printed in Prividium's docs, so parse it only after verification
  // and don't reject a body that isn't JSON.
  let payload: unknown = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.log(`Prividium webhook ${id}: body is not JSON (${rawBody.length} chars)`);
  }

  // One webhook is one subscription (an event webhook = contract + topic0, an address webhook = addresses),
  // so the route or the webhook's name tells you what it watches. Add your own handling here.
  console.log(`Received Prividium webhook ${id}`, payload ?? '');

  processedIds.add(id);
  return NextResponse.json({ received: true, duplicate: false });
}
