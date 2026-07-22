// Generated with: whatsapp-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a WhatsApp (Meta) webhook signature.
 *
 * Meta signs the raw request body with HMAC-SHA256 keyed on your app secret and
 * sends the lowercase hex digest in `X-Hub-Signature-256` as `sha256=<hex>`.
 */
function verifyWhatsAppSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): boolean {
  const [algo, sig] = (signatureHeader || '').split('=');
  if (algo !== 'sha256' || !sig) {
    return false;
  }

  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');

  // Timing-safe comparison; returns false on length mismatch instead of throwing.
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Dispatch a verified WhatsApp payload.
 *
 * Inbound messages arrive in value.messages[] and outbound status updates in
 * value.statuses[], both under the `messages` field.
 */
function handleWhatsAppEvent(payload: any): void {
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const { field, value } = change;

      if (field === 'messages') {
        for (const message of value.messages || []) {
          console.log(`Message ${message.id} from ${message.from} (${message.type})`);
          switch (message.type) {
            case 'text':
              console.log(`  Text: ${message.text.body}`);
              // TODO: reply, route to an agent, etc.
              break;
            case 'image':
            case 'audio':
            case 'video':
            case 'document':
            case 'sticker':
              console.log(`  Media id: ${message[message.type].id}`);
              // TODO: download media via the Cloud API using the media id.
              break;
            case 'interactive':
              console.log('  Interactive reply:', message.interactive);
              break;
            case 'button':
              console.log(`  Button: ${message.button.text}`);
              break;
            case 'reaction':
              console.log(`  Reaction: ${message.reaction.emoji}`);
              break;
            case 'location':
              console.log('  Location:', message.location);
              break;
            default:
              console.log(`  Unhandled message type: ${message.type}`);
          }
        }

        for (const status of value.statuses || []) {
          console.log(`Status ${status.id}: ${status.status} -> ${status.recipient_id}`);
          if (status.status === 'failed') {
            console.error('  Delivery failed:', status.errors);
          }
          // TODO: update your message record's delivery state.
        }
        continue;
      }

      switch (field) {
        case 'message_template_status_update':
          console.log('Template status update:', value.event);
          break;
        case 'account_update':
          console.log('Account update:', value.event);
          break;
        case 'phone_number_quality_update':
          console.log('Phone number quality update:', value.event);
          break;
        default:
          console.log(`Unhandled field: ${field}`);
      }
    }
  }
}

/**
 * GET — Meta verification handshake.
 * Echo hub.challenge as plain text when the verify token matches.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

/**
 * POST — event delivery. Verify the signature over the raw body, then dispatch.
 */
export async function POST(request: NextRequest) {
  // Read the raw body FIRST — do not parse before verifying (Meta escapes unicode).
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  if (!verifyWhatsAppSignature(rawBody, signature, process.env.WHATSAPP_APP_SECRET!)) {
    console.error('WhatsApp signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);

  if (payload.object !== 'whatsapp_business_account') {
    return NextResponse.json({ received: true, ignored: true });
  }

  handleWhatsAppEvent(payload);

  // Acknowledge quickly; do heavy work asynchronously.
  return NextResponse.json({ received: true });
}
