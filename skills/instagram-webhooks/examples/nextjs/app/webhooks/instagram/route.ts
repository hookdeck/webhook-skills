// Generated with: instagram-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const SIGNATURE_PATTERN = /^sha256=([0-9a-f]{64})$/i;

/**
 * Verify an Instagram (Meta) webhook signature.
 *
 * Meta sends X-Hub-Signature-256: sha256=<hex>, the HMAC-SHA256 hex digest of
 * the RAW request body keyed with the app secret. The pattern check guarantees
 * exactly 64 hex characters before Buffer.from(x, 'hex'), then the two 32-byte
 * digests are compared in constant time.
 */
function verifyInstagramSignature(
  rawBody: Buffer,
  signatureHeader: string | null,
  appSecret: string | undefined
): boolean {
  if (!signatureHeader || !appSecret) {
    return false;
  }

  const match = SIGNATURE_PATTERN.exec(signatureHeader);
  if (!match) {
    return false;
  }

  const received = Buffer.from(match[1], 'hex');
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest();

  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

type Json = Record<string, any>;

interface InstagramEntry {
  id?: string;
  time?: number;
  changes?: Array<{ field?: string; value?: Json }>;
  messaging?: Json[];
  standby?: Json[];
}

interface InstagramNotification {
  object?: string;
  entry?: InstagramEntry[];
}

/** Field changes: comments, live_comments, mentions, story_insights. */
function handleChange(change: { field?: string; value?: Json }, entry: InstagramEntry): void {
  const value = change.value || {};

  switch (change.field) {
    case 'comments':
    case 'live_comments': {
      // Instagram Login samples use value.id; Unified/Facebook Login use value.comment_id.
      const commentId = value.comment_id || value.id;
      console.log(`${change.field}: comment ${commentId} by @${value.from?.username} on media ${value.media?.id}`);
      // TODO: Moderate or reply to the comment.
      break;
    }
    case 'mentions':
      // comment_id is present only for a mention in a comment.
      console.log(`Mention on media ${value.media_id}${value.comment_id ? ` in comment ${value.comment_id}` : ''}`);
      break;
    case 'story_insights':
      console.log(`Story ${value.media_id} insights: reach ${value.reach}, impressions ${value.impressions}`);
      break;
    default:
      console.log(`Unhandled Instagram field: ${change.field} (account ${entry.id})`);
  }
}

/** Messaging events: the event is the key present on the item. */
function handleMessagingEvent(event: Json, source: string): void {
  const from = event.sender?.id;

  if (event.message) {
    const msg = event.message;
    if (msg.is_echo) {
      console.log(`Echo of message ${msg.mid} sent by the account to ${event.recipient?.id}`);
    } else if (msg.is_deleted) {
      console.log(`Message ${msg.mid} deleted by ${from}`);
    } else if (msg.admin_text && !msg.mid) {
      console.log(`Handoff notice (${msg.handoff_reason || 'no reason'}) for ${from}`);
    } else {
      const kind = msg.text ? 'text' : (msg.attachments || []).map((a: Json) => a.type).join(',');
      console.log(`Message ${msg.mid} from ${from} (${kind})`);
      // TODO: Reply via the Send API (respond to the webhook first).
    }
  } else if (event.reaction) {
    console.log(`Reaction ${event.reaction.action} ${event.reaction.reaction || ''} on ${event.reaction.mid}`);
  } else if (event.postback) {
    console.log(`Postback "${event.postback.title}" (${event.postback.payload}) from ${from}`);
  } else if (event.referral) {
    console.log(`Referral ref=${event.referral.ref} source=${event.referral.source} from ${from}`);
  } else if (event.read) {
    console.log(`Message ${event.read.mid} seen by ${from}`);
  } else if (event.message_edit) {
    console.log(`Message ${event.message_edit.mid} edited (${event.message_edit.num_edit} edits)`);
  } else {
    console.log(`Unhandled Instagram ${source} event: ${Object.keys(event).join(',')}`);
  }
}

/** Dispatch a notification: { object: 'instagram', entry: [...] }. */
function handleNotification(notification: InstagramNotification): void {
  if (notification.object !== 'instagram') {
    console.log(`Ignoring object: ${notification.object}`);
    return;
  }

  for (const entry of notification.entry || []) {
    for (const change of entry.changes || []) handleChange(change, entry);
    for (const event of entry.messaging || []) handleMessagingEvent(event, 'messaging');
    // Handover protocol: events for threads your app doesn't currently own.
    for (const event of entry.standby || []) handleMessagingEvent(event, 'standby');
  }
}

// Constant-time compare for the GET handshake's hub.verify_token.
function verifyTokenMatches(token: string | null, expected: string | undefined): boolean {
  if (!token || !expected) return false;
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// GET verification handshake: Meta sends this when the Callback URL is configured.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  if (mode === 'subscribe' && verifyTokenMatches(token, process.env.INSTAGRAM_VERIFY_TOKEN)) {
    // Echo the challenge back verbatim as plain text.
    return new NextResponse(challenge ?? '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return new NextResponse('Forbidden', { status: 403 });
}

// POST event delivery: read the raw bytes for signature verification.
export async function POST(request: NextRequest) {
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-hub-signature-256');

  if (!verifyInstagramSignature(rawBody, signature, process.env.INSTAGRAM_APP_SECRET)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after verification.
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Some Meta samples wrap the notification in an array; accept both forms.
  const notifications = Array.isArray(payload) ? payload : [payload];
  if (!notifications.every((n) => n !== null && typeof n === 'object')) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  (notifications as InstagramNotification[]).forEach(handleNotification);

  return new NextResponse('EVENT_RECEIVED', { status: 200 });
}
