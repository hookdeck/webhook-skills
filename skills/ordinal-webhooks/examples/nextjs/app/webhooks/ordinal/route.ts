// Generated with: ordinal-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'standardwebhooks';

// ---------------------------------------------------------------------------
// Ordinal signs every delivery per Standard Webhooks:
//   webhook-id         stable id for the event (the same on a retry)
//   webhook-timestamp  Unix seconds when the delivery was signed
//   webhook-signature  "v1,<base64 HMAC-SHA256>", space-separated when two
//                      signatures arrive during a secret rotation
//   webhook-topic      the event type; NOT covered by the signature
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`
// Key: base64-decode of the signing secret after its `whsec_` prefix.
// ---------------------------------------------------------------------------

interface OrdinalEvent {
  type: string; // post.published, post.approval.requested, ...
  data: Record<string, any>;
  createdAt: string;
}

type SignatureHeaders = Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string>;

function signatureHeaders(request: Request): SignatureHeaders | null {
  const id = request.headers.get('webhook-id');
  const timestamp = request.headers.get('webhook-timestamp');
  const signature = request.headers.get('webhook-signature');
  if (!id || !timestamp || !signature) return null;
  return { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signature };
}

/**
 * Verify an Ordinal delivery with the Standard Webhooks library, as Ordinal's
 * docs recommend. It accepts a match on any `v1,` entry and throws if
 * `webhook-timestamp` is more than five minutes from now.
 */
function verifyOrdinalWebhook(
  rawBody: string,
  headers: SignatureHeaders,
  secret = process.env.ORDINAL_WEBHOOK_SECRET as string
): OrdinalEvent {
  return new Webhook(secret).verify(rawBody, headers) as OrdinalEvent;
}

/** The single key inside `data` depends on the event family. */
function resourceKeyFor(type: string): string | null {
  if (type.startsWith('social_profile.')) return 'profile';
  if (type.startsWith('linkedin.monitoring.mention.')) return 'mention';
  if (type.startsWith('linkedin.monitoring.comment.')) return 'comment';
  if (type === 'post.comment.created' || type === 'post.inline_comment.created') return 'comment';
  if (type.includes('.approval.')) return 'approval';
  if (type.startsWith('invite.')) return 'invite';
  if (type.startsWith('post.')) return 'post';
  return null;
}

// In-memory dedupe for the demo. Use Redis or your database in production.
const processedEventIds = new Set<string>();

function handleEvent(event: OrdinalEvent): void {
  const key = resourceKeyFor(event.type);
  const r: Record<string, any> = (key && event.data?.[key]) || {};

  switch (event.type) {
    case 'post.published':
      // `postUrl` (the live link) may be null; `url` is the Ordinal app link.
      console.log(`Post published: ${r.title} -> ${r.postUrl ?? '(no channel URL)'}`);
      break;
    case 'post.publish_failed':
      console.log(`Publish failed: ${r.title}: ${r.error}`);
      break;
    case 'post.content.edited':
      // Debounced per post; carries the latest content for every channel.
      console.log(`Post content edited: ${r.title}`);
      break;
    case 'post.approval.requested':
      console.log(`Approval requested on "${r.post?.title}" from ${(r.createdApprovals ?? []).length} approver(s)`);
      break;
    case 'campaign.approval.requested':
    case 'campaign.approval.approved':
      console.log(`${event.type}: ${r.campaign?.name}`);
      break;
    case 'post.comment.created':
    case 'post.inline_comment.created':
      console.log(`Comment on "${r.post?.title}": ${r.message}`);
      break;
    case 'social_profile.reconnect_needed':
      console.log(`Profile needs reconnecting: ${r.name} (${r.channel})`);
      break;
    case 'linkedin.monitoring.comment.created':
    case 'linkedin.monitoring.comment.edited':
    case 'linkedin.monitoring.comment.deleted':
      console.log(`${event.type} on ${r.profile?.name}: ${r.commentary}`);
      break;
    case 'linkedin.monitoring.mention.created':
      console.log(`Company page mentioned: ${r.postUrl}`);
      break;
    default:
      console.log(`Ordinal event: ${event.type}`);
  }
}

export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  if (!process.env.ORDINAL_WEBHOOK_SECRET) {
    console.error('ORDINAL_WEBHOOK_SECRET is not set; rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const headers = signatureHeaders(request);
  if (!headers) {
    return NextResponse.json({ error: 'Missing webhook signature headers' }, { status: 400 });
  }

  // Raw body: request.json() would re-serialise and break the HMAC.
  const rawBody = await request.text();

  let event: OrdinalEvent;
  try {
    event = verifyOrdinalWebhook(rawBody, headers);
  } catch (err) {
    console.error('Ordinal webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const eventId = headers['webhook-id'];
  if (processedEventIds.has(eventId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Any 2xx acknowledges the delivery. In production, enqueue the event here.
    handleEvent(event);
    processedEventIds.add(eventId);
  } catch (err) {
    console.error('Error handling Ordinal event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
