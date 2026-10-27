// Generated with: quicknode-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyQuicknodeWebhook } from '@/lib/verify';

// Nonces of deliveries already handled (catches exact repeats). Use a database or cache with a unique index in production.
const processedNonces = new Set<string>();

export async function POST(request: NextRequest) {
  const secret = process.env.QUICKNODE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('QUICKNODE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes are required for signature verification (never request.json())
  const rawBody = Buffer.from(await request.arrayBuffer());
  const tolerance = Number(process.env.QUICKNODE_WEBHOOK_TOLERANCE_SECONDS) || 0;

  const result = verifyQuicknodeWebhook(rawBody, request.headers, secret, tolerance);
  if (!result.valid) {
    console.error(`Webhook verification failed: ${result.error}`);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse the payload only after verification
  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Skip a nonce we already handled successfully. This catches exact repeats (Hookdeck retries and
  // replays resend the same headers); Quicknode doesn't document whether its own retries reuse the
  // nonce, so also make processing idempotent on block number/hash and transaction hash.
  const nonce = request.headers.get('x-qn-nonce') as string;
  if (processedNonces.has(nonce)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Quicknode has no event types. Dispatch on the shape of the payload.
  // ILLUSTRATIVE shapes only: the real payload depends on your stream's dataset or webhook filter.
  if (Array.isArray(payload)) {
    // Webhooks: array of matched items (e.g. transactions)
    console.log(`Webhook delivery with ${payload.length} matched item(s)`);
  } else if (payload && Array.isArray(payload.data) && payload.metadata) {
    // Streams: a batch with `data` and `metadata`
    console.log(`Streams batch: ${payload.data.length} item(s), dataset=${payload.metadata.dataset}, network=${payload.metadata.network}`);
  } else {
    console.log('Unrecognised payload shape');
  }
  // TODO: Persist or enqueue the data, then return 2xx quickly

  processedNonces.add(nonce);
  return NextResponse.json({ received: true });
}
