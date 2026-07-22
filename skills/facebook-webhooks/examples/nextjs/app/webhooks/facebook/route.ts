// Generated with: facebook-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify Facebook webhook signature.
 *
 * Meta signs the RAW request body with HMAC-SHA256 keyed on your App Secret and
 * sends the digest in X-Hub-Signature-256 as `sha256=<hex>`. Verify over the raw
 * body BEFORE parsing JSON — Meta signs an escaped-unicode form of the payload,
 * so a re-serialized JSON string will not match.
 */
function verifyFacebookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): boolean {
  if (!signatureHeader) {
    return false;
  }

  // Header format: sha256=<hex>
  const [algo, signature] = signatureHeader.split('=');
  if (algo !== 'sha256' || !signature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

interface Change {
  field: string;
  value?: Record<string, unknown>;
}

interface Entry {
  id: string;
  time: number;
  changes?: Change[];
  messaging?: Array<Record<string, any>>;
}

/**
 * Dispatch a single entry. A POST can batch up to 1000 updates, so handle each
 * entry individually.
 */
function handleEntry(object: string, entry: Entry): void {
  // Messenger deliveries carry a `messaging` array instead of `changes`.
  if (Array.isArray(entry.messaging)) {
    for (const event of entry.messaging) {
      console.log(`Messenger message from ${event.sender?.id}:`, event.message?.text);
      // TODO: Route to your chatbot / support system.
    }
    return;
  }

  for (const change of entry.changes || []) {
    switch (`${object}:${change.field}`) {
      case 'page:feed':
        console.log('Page feed change:', change.value?.item, change.value?.verb);
        break;
      case 'page:mention':
        console.log('Page mentioned:', change.value?.post_id);
        break;
      case 'page:messages':
        console.log('Page message field change:', change.value);
        break;
      case 'instagram:comments':
        console.log('Instagram comment:', change.value?.id);
        break;
      case 'instagram:mentions':
        console.log('Instagram mention:', change.value?.media_id);
        break;
      case 'user:feed':
        console.log('User feed update:', change.value?.verb);
        break;
      default:
        console.log(`Unhandled (object, field): (${object}, ${change.field})`);
    }
  }
}

// GET verification handshake — Meta sends this when the Callback URL is saved.
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.FACEBOOK_VERIFY_TOKEN) {
    // Echo the challenge back verbatim to complete verification.
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse('Forbidden', { status: 403 });
}

// POST event delivery — read the raw body for signature verification.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  if (!verifyFacebookSignature(rawBody, signature, process.env.FACEBOOK_APP_SECRET!)) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after verification.
  const payload = JSON.parse(rawBody);
  const object: string = payload.object;

  console.log(`Received ${object} webhook with ${payload.entry?.length || 0} entr(y/ies)`);

  for (const entry of (payload.entry || []) as Entry[]) {
    handleEntry(object, entry);
  }

  // Acknowledge quickly; process heavy work asynchronously.
  return new NextResponse('EVENT_RECEIVED', { status: 200 });
}
