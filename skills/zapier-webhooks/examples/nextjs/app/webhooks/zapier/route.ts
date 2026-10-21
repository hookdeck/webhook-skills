// Generated with: zapier-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Receiver for the "Webhooks by Zapier" action (POST / PUT / Custom Request).
//
// Zapier does NOT sign these requests: no signature header, no HMAC, no
// signing secret. Authenticate with a secret you put into the Zap yourself:
//
//   - Headers section:  X-Webhook-Secret | <ZAPIER_WEBHOOK_SECRET>
//   - Basic Auth field: <username>|<password>  (sent as Authorization: Basic ...)
//
// Both are compared in constant time. The payload is whatever you defined in
// the action's Data section, so there is no fixed schema and no event type.

const SECRET_HEADER = 'x-webhook-secret';

interface ZapierAuthConfig {
  secret: string;
  username: string;
  password: string;
}

function config(): ZapierAuthConfig {
  return {
    secret: process.env.ZAPIER_WEBHOOK_SECRET || '',
    username: process.env.ZAPIER_BASIC_AUTH_USERNAME || '',
    password: process.env.ZAPIER_BASIC_AUTH_PASSWORD || '',
  };
}

// Constant-time compare. Hashing both sides gives equal-length buffers, so
// timingSafeEqual never throws and the secret's length isn't leaked.
export function safeEqual(a: string | null | undefined, b: string): boolean {
  if (typeof a !== 'string') return false;
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function verifySecretHeader(headerValue: string | null, secret: string): boolean {
  return Boolean(secret) && safeEqual(headerValue, secret);
}

export function verifyBasicAuth(
  authorizationHeader: string | null,
  username: string,
  password: string
): boolean {
  if (!username || !password || !authorizationHeader) return false;
  const match = authorizationHeader.match(/^Basic\s+(.+)$/i);
  if (!match) return false;
  const decoded = Buffer.from(match[1].trim(), 'base64').toString('utf8');
  return safeEqual(decoded, `${username}:${password}`);
}

/** Returns null when no method is configured, so the caller can fail closed. */
export function verifyZapierRequest(
  headers: Headers,
  cfg: ZapierAuthConfig = config()
): boolean | null {
  const headerConfigured = Boolean(cfg.secret);
  const basicConfigured = Boolean(cfg.username && cfg.password);
  if (!headerConfigured && !basicConfigured) return null;

  return (
    (headerConfigured && verifySecretHeader(headers.get(SECRET_HEADER), cfg.secret)) ||
    (basicConfigured && verifyBasicAuth(headers.get('authorization'), cfg.username, cfg.password))
  );
}

// Payload Type in the Zap decides the Content-Type: JSON, Form (URL-encoded),
// or XML / Raw / Custom Request text, which is returned as-is.
export function parseBody(rawBody: string, contentType: string): unknown {
  if (contentType.includes('application/json')) return JSON.parse(rawBody);
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(rawBody));
  }
  return rawBody;
}

/**
 * Handle one Zap action run. The fields are the keys you entered in the Data
 * section (or every field from the previous step if Data was left blank). If
 * several Zaps share this endpoint, add an `event` field in Data and dispatch.
 */
function handleZapAction(payload: unknown): string {
  const event =
    payload && typeof payload === 'object' && typeof (payload as any).event === 'string'
      ? (payload as any).event
      : 'zap action';

  switch (event) {
    // case 'lead.created':  // a value YOU chose in the Zap's Data section
    //   await createLead(payload);
    //   break;
    default:
      console.log(`Zapier ${event}:`, payload);
  }
  return event;
}

async function handle(request: NextRequest) {
  // Authenticate before parsing anything.
  const auth = verifyZapierRequest(request.headers);
  if (auth === null) {
    console.error('Zapier webhook refused: no ZAPIER_WEBHOOK_SECRET or Basic Auth credentials set');
    return NextResponse.json({ error: 'Webhook authentication not configured' }, { status: 500 });
  }
  if (!auth) {
    return NextResponse.json({ error: 'Invalid or missing credentials' }, { status: 401 });
  }

  const rawBody = await request.text();
  let payload: unknown;
  try {
    payload = parseBody(rawBody, request.headers.get('content-type') || '');
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const event = handleZapAction(payload);
  // Zapier marks the action step as errored on a non-2xx response.
  return NextResponse.json({ received: true, event }, { status: 200 });
}

export const POST = handle;
export const PUT = handle;
// Custom Request can also send PATCH or DELETE.
export const PATCH = handle;
export const DELETE = handle;
