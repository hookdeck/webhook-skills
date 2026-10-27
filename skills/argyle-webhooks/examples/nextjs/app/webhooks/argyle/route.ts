// Generated with: argyle-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyArgyleSignature } from '../../../lib/verify-argyle';

interface ArgylePayload {
  event?: string;
  name?: string;
  data?: { account?: string; user?: string; [key: string]: unknown };
  [key: string]: unknown;
}

function handleEvent(payload: ArgylePayload): void {
  const { event } = payload;

  switch (event) {
    case 'accounts.added':
    case 'accounts.connected':
    case 'accounts.failed':
    case 'accounts.removed':
    case 'accounts.updated':
      console.log(`Account event ${event}: account ${payload.data?.account}, user ${payload.data?.user}`);
      // TODO: update the connection state for payload.data.account
      break;

    case 'gigs.added':
    case 'gigs.updated':
    case 'gigs.removed':
    case 'gigs.partially_synced':
    case 'gigs.fully_synced':
      console.log(`Gig event ${event}:`, JSON.stringify(payload.data));
      // TODO: fetch the changed gigs by id from the Argyle API
      break;

    case 'identities.added':
    case 'identities.updated':
      console.log(`Identity event ${event}:`, JSON.stringify(payload.data));
      // TODO: fetch the identity by id and refresh your records
      break;

    case 'items.updated':
    case 'items.removed':
      console.log(`Item event ${event}:`, JSON.stringify(payload.data));
      // TODO: refresh your list of supported employers and platforms
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

async function handleWebhook(request: NextRequest) {
  // Raw bytes, exactly as received. A missing body is verified as zero bytes.
  const rawBody = new Uint8Array(await request.arrayBuffer());
  const signature = request.headers.get('x-argyle-signature'); // Headers lookup is case-insensitive

  // Verify first, for every method.
  if (!verifyArgyleSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid or missing X-Argyle-Signature' }, { status: 401 });
  }

  const text = new TextDecoder().decode(rawBody);
  if (text.trim() === '') {
    return NextResponse.json({ received: true });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as ArgylePayload);
  } catch (err) {
    console.error('Error handling Argyle event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  // Answer 200 within 10 s. Deliveries can repeat: make handlers idempotent.
  return NextResponse.json({ received: true });
}

// Argyle's docs don't name the HTTP method, so accept all of these.
export const GET = handleWebhook;
export const POST = handleWebhook;
export const PUT = handleWebhook;
export const PATCH = handleWebhook;
export const DELETE = handleWebhook;
