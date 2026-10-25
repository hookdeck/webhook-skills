// Generated with: act-on-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';

// ---------------------------------------------------------------------------
// Act-On delivers outgoing webhooks through an embedded Svix portal. Act-On's
// pages don't name the headers, but they are the Svix defaults:
//   svix-id         message ID, the same on every retry
//   svix-timestamp  Unix seconds of this delivery attempt
//   svix-signature  one or more space-separated "v1,<base64 HMAC-SHA256>" entries
// Signed content: `${svix-id}.${svix-timestamp}.${rawBody}`
// Key: base64-decode of the Signing Secret (after its `whsec_` prefix, if any).
// The svix-* names are inferred, so the same values sent as webhook-id /
// webhook-timestamp / webhook-signature (Svix's other prefix) are accepted too.
// ---------------------------------------------------------------------------

// Act-On payloads are each event's own object with NO event-type field.
type ActOnPayload = Record<string, any>;

type SvixHeaders = Record<'svix-id' | 'svix-timestamp' | 'svix-signature', string>;

/**
 * Verify an Act-On delivery with the Svix library. It checks the timestamp
 * (fixed 5-minute tolerance), recomputes the HMAC over the raw body, and
 * compares in constant time against every `v1,` entry.
 *
 * svix 2.x `verify()` returns nothing (it throws on failure), so the JSON is
 * parsed here after verification succeeds.
 */
function verifyActOnWebhook(rawBody: string, headers: SvixHeaders, secret: string): ActOnPayload {
  new Webhook(secret).verify(rawBody, headers);
  return JSON.parse(rawBody) as ActOnPayload;
}

/**
 * Infer the event type from the payload's shape. Returns the candidate event
 * types: one entry when the shape is unique, several when Act-On sends
 * identical shapes for different events (subscribe a separate endpoint per
 * event, or per group, if you need to tell those apart).
 */
function classifyPayload(p: unknown): string[] {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return [];
  const o = p as ActOnPayload;
  if ('formId' in o && 'formName' in o) return ['form.submitted'];
  if ('startedTime' in o) return ['automated-program.started'];
  if ('stoppedTime' in o) return ['automated-program.stopped'];
  if ('leadScore' in o && 'scoresheetId' in o) return ['contact-lead-score.upper-threshold-surpassed'];
  if ('scheduledTimestamp' in o) return ['email-message.scheduled'];
  if ('categoryChecked' in o) {
    return [o.categoryChecked ? 'subscription-category.opt-in' : 'subscription-category.opt-out'];
  }
  if ('hasOptedOut' in o) {
    return [o.hasOptedOut ? 'contact-opt.global-opt-out' : 'contact-opt.global-opt-in'];
  }
  if ('recId' in o && 'srcId' in o) return ['contact-email.marked-as-spam'];
  if ('isHardBounce' in o) {
    return ['msgId' in o || 'categoryReason' in o ? 'contact-bounce.hard' : 'contact-bounce.soft'];
  }
  if ('crmDisplayName' in o) return ['crm.connected', 'crm.disconnected'];
  if ('contact' in o && 'contactReportLink' in o) return ['contact.added', 'contact.updated'];
  if ('checked' in o && 'id' in o && 'name' in o) {
    return ['subscription-category.added', 'subscription-category.deleted', 'subscription-category.updated'];
  }
  return [];
}

// In-memory dedupe for the demo. Use Redis or your database in production.
// Act-On's body has no event ID, so dedupe on svix-id (same on every retry).
const processedMessageIds = new Set<string>();

function handleEvent(payload: ActOnPayload): void {
  const candidates = classifyPayload(payload);

  switch (candidates.join('|')) {
    case 'contact.added|contact.updated':
      // Same shape for both events. Use one endpoint per event type to tell them apart.
      console.log(`Contact added or updated: ${payload.email} (${payload.contactReportLink})`);
      break;
    case 'contact-bounce.hard':
      console.log(`Hard bounce: ${payload.email} (${payload.categoryReason}) for message ${payload.msgId}`);
      break;
    case 'contact-bounce.soft':
      console.log(`Soft bounce: ${payload.email}`);
      break;
    case 'contact-email.marked-as-spam':
      console.log(`Spam complaint: ${payload.email} on message ${payload.msgId}`);
      break;
    case 'contact-opt.global-opt-out':
      console.log(`Global opt-out: ${payload.email}`);
      break;
    case 'contact-opt.global-opt-in':
      console.log(`Global opt-in: ${payload.email}`);
      break;
    case 'contact-lead-score.upper-threshold-surpassed':
      console.log(`Lead score ${payload.leadScore} passed the threshold on ${payload.scoresheetId}: ${payload.email}`);
      break;
    case 'form.submitted':
      console.log(`Form submitted: ${payload.formName} (${payload.formId}) by ${payload.contact?.email}`);
      break;
    case 'automated-program.started':
      console.log(`Automated Program started: ${payload.name}`);
      break;
    case 'automated-program.stopped':
      console.log(`Automated Program stopped: ${payload.name}`);
      break;
    case 'subscription-category.opt-in':
    case 'subscription-category.opt-out':
      console.log(`${candidates[0]}: ${payload.email} -> ${payload.categoryName}`);
      break;
    case 'subscription-category.added|subscription-category.deleted|subscription-category.updated':
      console.log(`Subscription category changed: ${payload.name} (checked=${payload.checked})`);
      break;
    case 'crm.connected|crm.disconnected':
      console.log(`CRM connection event: ${payload.crmDisplayName} (${payload.detail})`);
      break;
    case 'email-message.scheduled':
      console.log(`Email scheduled: "${payload.title}" to ${payload.numTargetedRecipients} recipients`);
      break;
    default:
      console.log('Unrecognised Act-On payload shape:', Object.keys(payload ?? {}));
  }
}

// Act-On only sends POST.
export async function POST(request: Request) {
  // Fail closed: never accept unverified deliveries because a secret is missing.
  const secret = process.env.ACT_ON_WEBHOOK_SECRET;
  if (!secret) {
    console.error('ACT_ON_WEBHOOK_SECRET is not set - rejecting delivery');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Fall back to the webhook-* prefix when the svix-* headers are absent.
  const svixId = request.headers.get('svix-id') ?? request.headers.get('webhook-id');
  const svixTimestamp = request.headers.get('svix-timestamp') ?? request.headers.get('webhook-timestamp');
  const svixSignature = request.headers.get('svix-signature') ?? request.headers.get('webhook-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing Svix signature headers' }, { status: 400 });
  }

  // Raw body: the signature covers the exact bytes, so never verify request.json().
  const rawBody = await request.text();

  let payload: ActOnPayload;
  try {
    payload = verifyActOnWebhook(
      rawBody,
      { 'svix-id': svixId, 'svix-timestamp': svixTimestamp, 'svix-signature': svixSignature },
      secret
    );
  } catch (err) {
    console.error('Act-On webhook verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Duplicates are normal (at-least-once delivery) - acknowledge with 200.
  if (processedMessageIds.has(svixId)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // In production, enqueue the payload here and process it asynchronously.
    handleEvent(payload);
    processedMessageIds.add(svixId);
  } catch (err) {
    console.error('Error handling Act-On event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
