// Generated with: dealhub-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

/**
 * DEALHUB WEBHOOK AUTHENTICATION
 *
 * DealHub does NOT sign webhooks: no signature header, no HMAC, no timestamp.
 * Each webhook uses one of three Authentication Types:
 *
 *   Token : DealHub sends  Authorization: Bearer <TOKEN>
 *   Basic : DealHub sends  Authorization: Basic <CREDENTIALS>
 *   None  : no header (only for endpoints with no auth, or a SAS token in the URL)
 *
 * CAVEAT: the credential is the FULL Authorization header value, scheme
 * included. Build the exact expected string and compare the whole header in
 * constant time.
 */

type Env = Record<string, string | undefined>;

/** Build the Authorization value DealHub should send; null when unconfigured. */
export function expectedAuthorization(env: Env = process.env): string | null {
  if (env.DEALHUB_WEBHOOK_TOKEN) {
    return `Bearer ${env.DEALHUB_WEBHOOK_TOKEN}`;
  }
  if (env.DEALHUB_WEBHOOK_USERNAME && env.DEALHUB_WEBHOOK_PASSWORD) {
    const credentials = Buffer.from(
      `${env.DEALHUB_WEBHOOK_USERNAME}:${env.DEALHUB_WEBHOOK_PASSWORD}`,
      'utf8'
    ).toString('base64');
    return `Basic ${credentials}`;
  }
  return null;
}

/** Constant-time compare of the full Authorization header value. */
export function verifyDealhubAuthorization(
  header: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (!header || !expected) return false;
  const a = Buffer.from(header, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // Length guard first: timingSafeEqual throws on mismatched lengths.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** The DealHub event name lives in the payload's `event` field. */
export function eventName(payload: any): string {
  if (payload && typeof payload.event === 'string') return payload.event;
  // "Failure WebHook v1" is documented with only error_code / error_description.
  if (payload && ('error_code' in payload || 'error_description' in payload)) {
    return 'Failure WebHook v1';
  }
  return 'unknown';
}

export async function POST(request: NextRequest) {
  const expected = expectedAuthorization();

  // Fail closed on misconfiguration: 500, so it's distinguishable from a bad credential.
  if (!expected) {
    console.error(
      'Set DEALHUB_WEBHOOK_TOKEN (Token mode) or DEALHUB_WEBHOOK_USERNAME and ' +
        'DEALHUB_WEBHOOK_PASSWORD (Basic mode) — refusing unauthenticated webhooks'
    );
    return NextResponse.json({ error: 'Webhook authentication not configured' }, { status: 500 });
  }

  const authorization = request.headers.get('authorization');
  if (!authorization) {
    return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
  }

  if (!verifyDealhubAuthorization(authorization, expected)) {
    console.error('DealHub webhook Authorization header mismatch');
    return NextResponse.json({ error: 'Invalid Authorization header' }, { status: 401 });
  }

  // Authenticate first, parse second.
  let payload: any;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // event_info.event_id identifies this event notification: use it as your idempotency key.
  const eventId = payload?.event_info?.event_id;
  console.log(`✓ Authenticated DealHub webhook: ${eventName(payload)} (${eventId ?? 'no event_id'})`);

  handleEvent(payload);

  return NextResponse.json({ received: true });
}

function handleEvent(payload: any) {
  // TODO: check payload.event_info?.event_id against your store and return if seen.
  switch (eventName(payload)) {
    // --- Quote entity events ------------------------------------------------
    case 'draftQuote':
      console.log(
        `📝 Draft quote ${payload.dealhub_quote_id} (${payload.newly_created_quote ? 'created' : 'updated'})`
      );
      break;
    case 'primaryQuote':
      // Only the NEW primary quote is sent; infer that the previous one lost the flag.
      console.log(`⭐ Primary quote ${payload.dealhub_quote_id} for opportunity ${payload.dealhub_opportunity_id}`);
      break;
    case 'quotePendingApproval':
      console.log(`⏳ Quote pending approval: ${payload.dealhub_quote_id}`);
      break;
    case 'quoteReady':
      console.log(`✅ Quote ready to send: ${payload.dealhub_quote_id}`);
      break;
    case 'quoteRejected':
      console.log(`❌ Quote rejected: ${payload.dealhub_quote_id}`);
      break;
    case 'quoteRecalled':
      console.log(`↩️  Quote recalled: ${payload.dealhub_quote_id}`);
      break;
    case 'quotePublished':
      console.log(`📤 Quote published to DealRoom: ${payload.dealhub_quote_id}`);
      break;
    case 'quoteUnpublished':
      console.log(`📥 Quote unpublished: ${payload.dealhub_quote_id}`);
      break;
    case 'quoteWon':
      console.log(`🏆 Quote won: ${payload.dealhub_quote_id}`);
      break;

    // --- Version / user events (dispatch on `action`) -----------------------
    case 'version':
      // action: created | activated | reactivated
      console.log(`🧩 Version ${payload.version_id} ${payload.action} (status ${payload.status})`);
      break;
    case 'user':
      // action: created | modified | deleted
      console.log(`👤 User ${payload.user_login} ${payload.action}`);
      break;

    // --- System & async events ----------------------------------------------
    case 'productsUpload':
      // upload_status: success | error; event_info.request_id identifies the upload
      console.log(
        `📦 Products upload ${payload.upload_status} for version ${payload.version_id} (${payload.imported_skus} SKUs)`
      );
      break;
    case 'crmImport':
      console.log('🔄 CRM import completed');
      break;
    case 'Failure WebHook v1':
      console.log(`⚠️  Async request failed: ${payload.error_code} ${payload.error_description}`);
      break;

    // --- DealRoom events ----------------------------------------------------
    case 'DEALROOM_EVENT': {
      // The specific activity is the key of action_summary, e.g. DEAL_SIGN.
      const [activity] = Object.keys(payload.action_summary || {});
      console.log(`🏠 DealRoom activity ${activity} on quote ${payload.dealhub_quote_id}`);
      break;
    }

    default:
      console.log(`Unhandled DealHub event: ${eventName(payload)}`);
  }
}
