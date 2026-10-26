// Generated with: logto-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

const HEX_DIGEST = /^[0-9a-fA-F]{64}$/;

// Logto sends the bare hex HMAC-SHA256 of the raw body in logto-signature-sha-256.
// Nothing else is signed (no timestamp), so there is no replay window to check.
function verifyLogtoSignature(rawBody: Buffer, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) return false;
  // Validate the format before decoding: Buffer.from(x, 'hex') drops bad characters silently
  if (!HEX_DIGEST.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signatureHeader.toLowerCase(), 'hex');
  return crypto.timingSafeEqual(received, expected);
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

// Parsed fields are untrusted: check types before reading into them
function userIdOf(body: Record<string, unknown>): string | undefined {
  return str(body.userId) ?? (isObject(body.user) ? str(body.user.id) : undefined);
}

function dataIdOf(body: Record<string, unknown>): string | undefined {
  return isObject(body.data) ? str(body.data.id) : undefined;
}

export async function POST(request: NextRequest) {
  const secret = process.env.LOGTO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('LOGTO_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes: read before any JSON parsing
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyLogtoSignature(rawBody, request.headers.get('logto-signature-sha-256'), secret)) {
    console.error('Logto signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!isObject(body) || typeof body.event !== 'string') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Dispatch on the top-level `event`; interactionEvent is not the event name
  switch (body.event) {
    case 'PostRegister':
      console.log(`User registered: ${userIdOf(body)}`);
      break;
    case 'PostSignIn':
      console.log(`User signed in: ${userIdOf(body)} (app ${isObject(body.application) ? str(body.application.name) : undefined})`);
      break;
    case 'PostResetPassword':
      console.log(`Password reset for user ${userIdOf(body)}`);
      break;
    case 'User.Created':
      console.log(`User created: ${dataIdOf(body)}`);
      break;
    case 'User.Data.Updated':
      console.log(`User updated: ${dataIdOf(body)}`);
      break;
    case 'User.Deleted': // data is null
      console.log('User deleted');
      break;
    case 'User.SuspensionStatus.Updated':
      console.log(`User suspension status changed: ${dataIdOf(body)}`);
      break;
    case 'Grant.LimitExceeded':
      console.log(`Grant limit exceeded for user ${userIdOf(body)}, revoked ${Array.isArray(body.revokedGrantIds) ? body.revokedGrantIds.length : 0} grant(s)`);
      break;
    default:
      console.log(`Unhandled Logto event: ${body.event}`);
  }

  return NextResponse.json({ received: true });
}
