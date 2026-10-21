// Generated with: dropbox-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// X-Dropbox-Signature is the hex HMAC-SHA256 of the raw body, keyed with the app secret
function verifySignature(rawBody: string, signature: string | null, appSecret: string | undefined): boolean {
  if (!signature || !appSecret) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // different lengths
  }
}

// Verification request: Dropbox sends GET ?challenge=<value> when the URI is added.
// Echo it back as text/plain with nosniff.
export async function GET(request: NextRequest) {
  const challenge = request.nextUrl.searchParams.get('challenge');
  if (challenge === null) {
    return new NextResponse('Missing challenge', { status: 400 });
  }
  return new NextResponse(challenge, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function POST(request: NextRequest) {
  // Raw body is required for signature verification
  const rawBody = await request.text();
  const signature = request.headers.get('x-dropbox-signature');

  if (!verifySignature(rawBody, signature, process.env.DROPBOX_APP_SECRET)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let payload: { list_folder?: { accounts?: string[] }; delta?: { users?: number[] } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Dropbox sends change pings, not event types. For each account, call
  // /files/list_folder/continue with the stored cursor (do this asynchronously
  // in production so the response returns within Dropbox's 10 second limit).
  const accounts = payload.list_folder?.accounts ?? [];
  for (const accountId of accounts) {
    console.log(`Dropbox: list_folder changes for ${accountId}`);
  }

  return NextResponse.json({ received: true });
}
