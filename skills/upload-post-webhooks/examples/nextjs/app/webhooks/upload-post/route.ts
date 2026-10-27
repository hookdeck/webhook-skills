import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Upload-Post signs `<timestamp>.<raw body>` with HMAC-SHA256 (hex) and sends it as
// `sha256=<hex>`. The key is the whole webhook secret (including whsec_) used as-is.
// This is NOT Standard Webhooks: nothing is base64-decoded.
function verifyUploadPostSignature(
  rawBody: Buffer,
  signature: string | null,
  timestamp: string | null,
  secret: string | undefined
): boolean {
  if (!signature || !timestamp || !secret) return false;

  const hex = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  // Validate length and alphabet before decoding: Buffer.from(x, 'hex') drops bad characters
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return false;

  // Signed message as bytes: timestamp header (latin1), ".", raw body bytes
  const signed = Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from('.'), rawBody]);
  const expected = crypto.createHmac('sha256', secret).update(signed).digest();
  const received = Buffer.from(hex.toLowerCase(), 'hex');

  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

// Opt-in replay window. Off by default: Hookdeck retries and replays keep the original timestamp.
function timestampWithinTolerance(timestamp: string, toleranceSeconds: number): boolean {
  if (!toleranceSeconds) return true;
  if (!/^\d+$/.test(timestamp)) return false;
  return Math.abs(Date.now() / 1000 - Number(timestamp)) <= toleranceSeconds;
}

export async function POST(request: NextRequest) {
  // Raw bytes: the exact bytes are what was signed
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-upload-post-signature');
  const timestamp = request.headers.get('x-upload-post-timestamp');

  if (!verifyUploadPostSignature(rawBody, signature, timestamp, process.env.UPLOAD_POST_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const tolerance = Number(process.env.UPLOAD_POST_WEBHOOK_TOLERANCE_SECONDS) || 0;
  if (!timestampWithinTolerance(timestamp as string, tolerance)) {
    return NextResponse.json({ error: 'Timestamp outside tolerance' }, { status: 401 });
  }

  // Parse only after verification
  let payload: {
    event?: string;
    user_email?: string;
    platform?: string;
    account_name?: string;
    reason?: string;
    comment?: { text?: string };
    post?: { id?: string };
  };
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (payload === null || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  switch (payload.event) {
    case 'upload_completed':
      console.log(`Upload completed for ${payload.user_email}`);
      break;
    case 'social_account_connected':
      console.log(`Account connected: ${payload.platform} ${payload.account_name}`);
      break;
    case 'social_account_disconnected':
      console.log(`Account disconnected: ${payload.platform} ${payload.account_name} (${payload.reason})`);
      break;
    case 'social_account_reauth_required':
      console.log(`Reauth required: ${payload.platform} ${payload.account_name} (${payload.reason})`);
      break;
    case 'comment_received':
      console.log(`Comment on ${payload.post?.id}: ${payload.comment?.text}`);
      break;
    case 'dm_received':
      console.log(`DM received on ${payload.platform}`);
      break;
    default:
      console.log(`Unhandled event: ${payload.event}`);
  }

  return NextResponse.json({ received: true });
}
