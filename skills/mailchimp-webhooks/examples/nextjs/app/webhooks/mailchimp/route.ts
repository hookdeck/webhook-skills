// Generated with: mailchimp-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Timing-safe compare of the ?secret= query param against the stored secret.
 *
 * Mailchimp does NOT sign its webhooks — there is no HMAC or signature header.
 * Secure the endpoint by registering the webhook URL with an unguessable secret
 * in the query string and validating it here on every POST.
 */
export function verifyMailchimpSecret(provided: string | null, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch — guard first.
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

type NestedForm = Record<string, unknown>;

/**
 * Parse Mailchimp's form-encoded body (bracket notation) into a nested object.
 * "data[merges][FNAME]=x" -> { data: { merges: { FNAME: 'x' } } }
 */
export function parseFormData(searchParams: URLSearchParams): NestedForm {
  const result: NestedForm = {};
  for (const [rawKey, value] of searchParams) {
    const path = rawKey.replace(/\]/g, '').split('[');
    let node = result;
    for (let i = 0; i < path.length - 1; i++) {
      const k = path[i];
      if (typeof node[k] !== 'object' || node[k] === null) node[k] = {};
      node = node[k] as NestedForm;
    }
    node[path[path.length - 1]] = value;
  }
  return result;
}

// Mailchimp's URL-validation ping is a GET — respond 200 so the webhook saves.
// Do not require the secret here; it's a liveness check, not a data delivery.
export async function GET() {
  return new NextResponse('OK', { status: 200 });
}

// Event delivery is a POST with application/x-www-form-urlencoded.
export async function POST(request: NextRequest) {
  const secret = new URL(request.url).searchParams.get('secret');
  if (!verifyMailchimpSecret(secret, process.env.MAILCHIMP_WEBHOOK_SECRET || '')) {
    console.error('Mailchimp secret verification failed');
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const rawBody = await request.text();
  const payload = parseFormData(new URLSearchParams(rawBody));
  const type = payload.type as string | undefined;
  const data = (payload.data as Record<string, string>) || {};

  try {
    dispatchMailchimpEvent(type, data);
  } catch (err) {
    console.error('Error handling Mailchimp event:', err);
    return new NextResponse('Server error', { status: 500 });
  }

  return new NextResponse('OK', { status: 200 });
}

// Dispatch on the top-level `type` field.
function dispatchMailchimpEvent(type: string | undefined, data: Record<string, string>) {
  switch (type) {
    case 'subscribe':
      console.log(`Subscribe: ${data.email} joined list ${data.list_id}`);
      // TODO: upsert the contact into your CRM/DB
      break;
    case 'unsubscribe':
      // data.action is 'unsub' or 'delete'; data.reason is 'manual' or 'abuse'
      console.log(`Unsubscribe (${data.action}/${data.reason}): ${data.email} from list ${data.list_id}`);
      // TODO: suppress the contact / update marketing consent
      break;
    case 'profile':
      console.log(`Profile update: ${data.email} on list ${data.list_id}`);
      // TODO: sync updated merge fields
      break;
    case 'upemail':
      console.log(`Email changed: ${data.old_email} -> ${data.new_email} on list ${data.list_id}`);
      // TODO: re-key the contact by data.new_id / data.new_email
      break;
    case 'cleaned':
      // data.reason is 'hard' (bounce) or 'abuse' (spam complaint)
      console.log(`Cleaned (${data.reason}): ${data.email} on list ${data.list_id}`);
      // TODO: mark the address undeliverable
      break;
    case 'campaign':
      console.log(`Campaign ${data.id} "${data.subject}" status: ${data.status}`);
      // TODO: trigger post-send reporting/automation
      break;
    default:
      console.log('Unhandled Mailchimp event type:', type);
  }
}
