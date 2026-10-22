// Generated with: taiga-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import crypto from 'crypto';

interface TaigaWebhookPayload {
  action: string;
  type: string;
  by?: { username?: string };
  date?: string;
  data?: { id?: number; subject?: string; name?: string; slug?: string };
  change?: unknown;
}

/**
 * Verify a Taiga webhook signature.
 * Taiga sends the bare hex HMAC-SHA1 of the raw body (key = webhook secret key, UTF-8)
 * in the X-TAIGA-WEBHOOK-SIGNATURE header.
 */
function verifyTaigaWebhook(
  rawBody: string,
  signature: string | null,
  secret: string | undefined
): boolean {
  if (!signature || !secret) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha1', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; throws on length mismatch, which means invalid
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature.toLowerCase()),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  // Read the raw body before parsing - the signature covers these exact bytes
  const body = await request.text();
  const signature = request.headers.get('x-taiga-webhook-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing X-TAIGA-WEBHOOK-SIGNATURE header' }, { status: 400 });
  }

  if (!verifyTaigaWebhook(body, signature, process.env.TAIGA_WEBHOOK_SECRET)) {
    console.error('Taiga webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload only after verification
  let payload: TaigaWebhookPayload;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Taiga sends no event header: the event is the body's type + action
  const { type, action, data = {}, by } = payload;
  const label = data.subject || data.name || data.slug || data.id;
  console.log(`Received ${type} ${action} by ${by?.username ?? 'unknown'}`);

  switch (`${type} ${action}`) {
    case 'userstory create':
      console.log(`User story created: ${label}`);
      // TODO: Sync the new user story
      break;

    case 'userstory change':
      console.log(`User story changed: ${label}`);
      // TODO: Inspect payload.change.diff for the edited fields
      break;

    case 'userstory delete':
      console.log(`User story deleted: ${label}`);
      break;

    case 'task create':
      console.log(`Task created: ${label}`);
      break;

    case 'task change':
      console.log(`Task changed: ${label}`);
      break;

    case 'task delete':
      console.log(`Task deleted: ${label}`);
      break;

    case 'issue create':
    case 'issue change':
    case 'issue delete':
      console.log(`${type} ${action}: ${label}`);
      break;

    case 'epic create':
    case 'epic change':
    case 'epic delete':
      console.log(`${type} ${action}: ${label}`);
      break;

    case 'milestone create':
    case 'milestone change':
    case 'milestone delete':
      console.log(`${type} ${action}: ${label}`);
      break;

    case 'wikipage create':
    case 'wikipage change':
    case 'wikipage delete':
      console.log(`${type} ${action}: ${label}`);
      break;

    case 'test test':
      console.log('Taiga test webhook received');
      break;

    default:
      console.log(`Unhandled event: ${type} ${action}`);
  }

  return NextResponse.json({ received: true });
}
