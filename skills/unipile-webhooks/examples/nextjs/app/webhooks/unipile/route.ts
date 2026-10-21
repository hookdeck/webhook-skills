// Generated with: unipile-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Unipile webhooks are NOT signed. When you create a webhook you can add a
// "headers" array, e.g. {"key": "Unipile-Auth", "value": "<secret>"}; Unipile sends
// those headers on every delivery. Compare the secret in constant time.
//
// Payload shapes depend on the webhook `source`: messaging, email, email_tracking and
// users send a flat object with an `event` field; account_status sends
// { "AccountStatus": { account_id, account_type, message } }.

const DEFAULT_HEADER = 'Unipile-Auth';

export const EVENTS = {
  MESSAGE_RECEIVED: 'message_received',
  MESSAGE_READ: 'message_read',
  MAIL_RECEIVED: 'mail_received',
  MAIL_SENT: 'mail_sent',
  MAIL_MOVED: 'mail_moved',
  MAIL_OPENED: 'mail_opened',
  MAIL_LINK_CLICKED: 'mail_link_clicked',
  NEW_RELATION: 'new_relation',
} as const;

interface UnipileAttendee {
  attendee_id?: string;
  attendee_name?: string;
  attendee_provider_id?: string;
}

interface AccountStatus {
  account_id?: string;
  account_type?: string;
  message?: string;
}

export interface UnipilePayload {
  event?: string;
  AccountStatus?: AccountStatus;
  account_id?: string;
  account_type?: string;
  account_info?: { user_id?: string };
  chat_id?: string;
  message_id?: string;
  message?: string;
  sender?: UnipileAttendee;
  email_id?: string;
  event_id?: string;
  subject?: string;
  from_attendee?: { identifier?: string };
}

/**
 * Compare the shared secret from the custom header in constant time.
 * Throws when UNIPILE_WEBHOOK_SECRET is unset so the route fails closed.
 */
export function verifyUnipileSecret(headerValue: string | null): boolean {
  const expected = process.env.UNIPILE_WEBHOOK_SECRET;
  if (!expected) {
    throw new Error('UNIPILE_WEBHOOK_SECRET is not set');
  }
  if (headerValue === null) return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  // Length check first: timingSafeEqual throws when lengths differ.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Unipile has no delivery ID header and retries up to 5 times, so dedupe on body fields. */
export function dedupeKey(payload: UnipilePayload): string | null {
  if (payload.AccountStatus) {
    const s = payload.AccountStatus;
    return `account_status:${s.account_id}:${s.message}`;
  }
  switch (payload.event) {
    case EVENTS.MAIL_OPENED:
    case EVENTS.MAIL_LINK_CLICKED:
      return payload.event_id ? `${payload.event}:${payload.event_id}` : null;
    case EVENTS.MAIL_RECEIVED:
    case EVENTS.MAIL_SENT:
    case EVENTS.MAIL_MOVED:
      return payload.email_id ? `${payload.event}:${payload.email_id}` : null;
    default:
      return payload.message_id ? `${payload.event}:${payload.message_id}` : null;
  }
}

async function handleMessageReceived(p: UnipilePayload) {
  // Sent messages also arrive as message_received: compare account_info.user_id
  // with sender.attendee_provider_id to spot your own.
  const own = !!p.account_info?.user_id && p.account_info.user_id === p.sender?.attendee_provider_id;
  console.log(
    `Message ${p.message_id} in chat ${p.chat_id} (${p.account_type}) from ${p.sender?.attendee_name ?? 'unknown'}${own ? ' [sent by connected account]' : ''}`
  );
  // TODO: store or forward the message. Attachment urls are att:// references.
}

async function handleMessageRead(p: UnipilePayload) {
  console.log(`Message ${p.message_id} read in chat ${p.chat_id}`);
}

async function handleMailReceived(p: UnipilePayload) {
  console.log(`Email ${p.email_id} "${p.subject ?? ''}" from ${p.from_attendee?.identifier ?? 'unknown'}`);
}

async function handleAccountStatus(s: AccountStatus) {
  console.log(`Account ${s.account_id} (${s.account_type}) status: ${s.message}`);
  if (s.message !== 'OK') {
    // Not OK (e.g. CREDENTIALS) means no more new-message webhooks for this account
    // until it is reconnected. TODO: alert the user and start the reconnect flow.
  }
}

/** Dispatch on the payload shape. Returns whether it was recognised. */
export async function dispatch(payload: UnipilePayload): Promise<boolean> {
  if (payload.AccountStatus && typeof payload.AccountStatus === 'object') {
    await handleAccountStatus(payload.AccountStatus);
    return true;
  }
  switch (payload.event) {
    case EVENTS.MESSAGE_RECEIVED:
      await handleMessageReceived(payload);
      return true;
    case EVENTS.MESSAGE_READ:
      await handleMessageRead(payload);
      return true;
    case EVENTS.MAIL_RECEIVED:
      await handleMailReceived(payload);
      return true;
    case EVENTS.MAIL_SENT:
    case EVENTS.MAIL_MOVED:
    case EVENTS.MAIL_OPENED:
    case EVENTS.MAIL_LINK_CLICKED:
    case EVENTS.NEW_RELATION:
      console.log(`Unipile event ${payload.event} (account ${payload.account_id ?? 'n/a'})`);
      return true;
    default:
      // Acknowledge unknown events so Unipile doesn't retry them.
      console.warn(`Unhandled Unipile event: ${payload.event}`);
      return false;
  }
}

export async function POST(request: NextRequest) {
  const headerName = process.env.UNIPILE_WEBHOOK_HEADER || DEFAULT_HEADER;

  // Check the shared secret BEFORE reading the body.
  let ok: boolean;
  try {
    // Headers.get() is case-insensitive.
    ok = verifyUnipileSecret(request.headers.get(headerName));
  } catch (err) {
    console.error(`Unipile webhook misconfigured: ${(err as Error).message}`);
    return new NextResponse('Webhook secret not configured', { status: 500 });
  }
  if (!ok) {
    console.error(`Unipile webhook rejected: ${headerName} missing or wrong`);
    return new NextResponse('Invalid webhook secret', { status: 401 });
  }

  // API-created webhooks send no JSON Content-Type by default, so read text and parse.
  let parsed: unknown;
  try {
    parsed = JSON.parse(await request.text());
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  const payload = parsed as UnipilePayload | null;
  if (
    !payload ||
    typeof payload !== 'object' ||
    (typeof payload.event !== 'string' && !payload.AccountStatus)
  ) {
    return new NextResponse('Missing event field', { status: 400 });
  }

  console.log(`Unipile webhook: ${payload.event ?? 'account_status'} key=${dedupeKey(payload)}`);

  try {
    await dispatch(payload);
  } catch (err) {
    console.error(`Unipile webhook processing failed: ${(err as Error).message}`);
    // Unipile retries up to 5 times unless it gets a 200 within 30 seconds.
    return new NextResponse('Processing failed', { status: 500 });
  }

  return NextResponse.json({ received: true });
}
