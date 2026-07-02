// Generated with: auth0-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Auth0 Custom Log Streams are not signed. Authenticate the request by
 * timing-safe comparing the incoming Authorization header against the token
 * you configured on the log stream.
 */
export function verifyAuth0Token(
  headerValue: string | null,
  expectedToken: string | undefined
): boolean {
  if (!headerValue || !expectedToken) return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expectedToken);
  // timingSafeEqual throws on unequal lengths — guard first.
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

interface Auth0LogData {
  type?: string;
  description?: string;
  ip?: string;
  user_id?: string;
  user_name?: string;
  [key: string]: unknown;
}

interface Auth0LogEvent {
  log_id?: string;
  data?: Auth0LogData;
}

function handleEvent(event: Auth0LogEvent): void {
  const data = event.data ?? (event as Auth0LogData);
  const type = data.type;

  switch (type) {
    case 's':
      console.log(`Success login: ${data.user_name ?? data.user_id}`);
      // TODO: update last-login, send "new login" notification, etc.
      break;

    case 'f':
      console.log(`Failed login from ${data.ip}: ${data.description}`);
      // TODO: fraud/brute-force detection, alerting, etc.
      break;

    case 'ss':
      console.log(`Success signup: ${data.user_name ?? data.user_id}`);
      // TODO: provision the user, send welcome email, CRM sync, etc.
      break;

    case 'fs':
      console.log(`Failed signup: ${data.description}`);
      // TODO: debug registration flow, alerting, etc.
      break;

    case 'sepft':
      console.log(`Token exchange (password grant) for ${data.user_name ?? data.user_id}`);
      // TODO: token issuance auditing, etc.
      break;

    default:
      console.log(`Unhandled event type: ${type}`);
  }
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

  if (!authHeader) {
    return NextResponse.json(
      { error: 'Missing Authorization header' },
      { status: 401 }
    );
  }

  if (!verifyAuth0Token(authHeader, process.env.AUTH0_LOG_STREAM_TOKEN)) {
    return NextResponse.json(
      { error: 'Invalid Authorization token' },
      { status: 401 }
    );
  }

  // Auth0 batches events — the body is an array (be defensive about a single object).
  const body = await request.json();
  const events: Auth0LogEvent[] = Array.isArray(body) ? body : [body];

  // Process synchronously here; for slow work, enqueue and return immediately.
  for (const event of events) {
    try {
      handleEvent(event);
    } catch (err) {
      console.error('Error handling event:', err);
    }
  }

  // Acknowledge — Auth0 retries on any non-2xx response.
  return NextResponse.json({ received: events.length });
}
