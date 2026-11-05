// Generated with: messenger-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const SIGNATURE_PATTERN = /^sha256=([0-9a-f]{64})$/i;

/**
 * Verify a Facebook Messenger (Meta) webhook signature.
 *
 * Meta sends X-Hub-Signature-256: sha256=<hex>, the HMAC-SHA256 hex digest of
 * the request body keyed with the App Secret. Meta signs the escaped-unicode
 * payload, so the HMAC must run over the RAW bytes as received. The pattern
 * check guarantees 64 hex characters before Buffer.from(x, 'hex'), then the
 * two 32-byte digests are compared in constant time.
 */
function verifyMessengerSignature(
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

interface MessengerNotification {
  object?: string;
  entry?: Array<{ id?: string; time?: number; messaging?: Json[]; standby?: Json[] }>;
}

/** Name the Messenger field an item belongs to (one event key per item). */
function eventType(event: Json): string {
  if (event.message) return event.message.is_echo ? 'message_echoes' : 'messages';
  if (event.postback) return 'messaging_postbacks';
  if (event.read) return 'message_reads';
  if (event.delivery) return 'message_deliveries';
  if (event.reaction) return 'message_reactions';
  if (event.optin) return 'messaging_optins';
  if (event.referral) return 'messaging_referrals';
  if (event.message_edit) return 'message_edits';
  if (event.account_linking) return 'messaging_account_linking';
  return 'unknown';
}

function handleMessagingEvent(event: Json, channel: string): void {
  const psid = event.sender?.id ?? event.sender?.user_ref;

  switch (eventType(event)) {
    case 'messages': {
      const msg = event.message;
      if (msg.admin_text && !msg.mid) {
        console.log(`Handoff notice (${msg.handoff_reason || 'no reason'}) for ${psid}`);
      } else if (msg.quick_reply) {
        console.log(`Quick reply ${msg.quick_reply.payload} from ${psid}`);
      } else {
        const kind = msg.text ? 'text' : (msg.attachments || []).map((a: Json) => a.type).join(',');
        console.log(`Message ${msg.mid} from ${psid} (${kind})`);
      }
      // TODO: Reply via the Send API. Respond 200 first: Meta expects it within 5s.
      break;
    }
    case 'message_echoes':
      console.log(`Echo of ${event.message.mid} sent by app ${event.message.app_id} to ${event.recipient?.id}`);
      break;
    case 'messaging_postbacks':
      console.log(`Postback "${event.postback.title}" (${event.postback.payload}) from ${psid}`);
      break;
    case 'message_reads':
      console.log(`${psid} read messages up to ${event.read.watermark}`);
      break;
    case 'message_deliveries':
      console.log(`Delivered up to ${event.delivery.watermark} (${(event.delivery.mids || []).length} mids)`);
      break;
    case 'message_reactions':
      console.log(`Reaction ${event.reaction.action} ${event.reaction.reaction || ''} on ${event.reaction.mid}`);
      break;
    case 'messaging_optins':
      console.log(`Opt-in ${event.optin.type || 'plugin'} from ${psid}`);
      break;
    case 'messaging_referrals':
      console.log(`Referral ref=${event.referral.ref} source=${event.referral.source} from ${psid}`);
      break;
    case 'message_edits':
      console.log(`Message ${event.message_edit.mid} edited (${event.message_edit.num_edit} edits)`);
      break;
    case 'messaging_account_linking':
      console.log(`Account ${event.account_linking.status} for ${psid}`);
      break;
    default:
      console.log(`Unhandled Messenger ${channel} event: ${Object.keys(event).join(',')}`);
  }
}

/** Dispatch a notification: { object: 'page', entry: [{ messaging: [...] }] }. */
function handleNotification(notification: MessengerNotification): void {
  if (notification.object !== 'page') {
    // Instagram messaging arrives as object "instagram": see instagram-webhooks.
    console.log(`Ignoring object: ${notification.object}`);
    return;
  }

  for (const entry of notification.entry || []) {
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

  if (mode === 'subscribe' && verifyTokenMatches(token, process.env.MESSENGER_VERIFY_TOKEN)) {
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

  if (!verifyMessengerSignature(rawBody, signature, process.env.MESSENGER_APP_SECRET)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after verification.
  let notification: unknown;
  try {
    notification = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!notification || typeof notification !== 'object' || Array.isArray(notification)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  handleNotification(notification as MessengerNotification);

  return new NextResponse('EVENT_RECEIVED', { status: 200 });
}
