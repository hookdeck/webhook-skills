// Generated with: safebase-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { getEventName } from '../../../lib/safebase';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.SAFEBASE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SAFEBASE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // SafeBase doesn't name the headers; svix-* is inferred, so fall back to the
  // webhook-* prefix (Svix's other prefix) when the svix-* headers are absent.
  const svixId = request.headers.get('svix-id') ?? request.headers.get('webhook-id');
  const svixTimestamp = request.headers.get('svix-timestamp') ?? request.headers.get('webhook-timestamp');
  const svixSignature = request.headers.get('svix-signature') ?? request.headers.get('webhook-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes SafeBase signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${body}` against every
    // v1, signature and enforces a fixed 5-minute timestamp window. That window
    // rejects late Hookdeck retries/replays: see references/verification.md.
    new Webhook(secret).verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('SafeBase webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const type = getEventName(body);
  // svix-id is stable across retries: use it to deduplicate
  console.log(`Received SafeBase webhook ${svixId}: ${type ?? '(no event name)'}`);

  switch (type) {
    case 'accessRequest.requested':
      console.log('Access request received:', body);
      break;
    case 'accessRequest.blocked':
      console.log('Access request blocked:', body);
      break;
    case 'accessRequest.autoApprove.requireManual':
      console.log('Access request needs manual approval:', body);
      break;
    case 'accounts.created':
      console.log('Account created:', body);
      break;
    case 'accounts.nda.completed':
      console.log('NDA completed:', body);
      break;
    case 'portal.viewed':
      console.log('Trust Center viewed:', body);
      break;
    case 'portal.file.downloaded':
      console.log('File downloaded:', body);
      break;
    case 'questionnaire.completed':
      console.log('Questionnaire completed:', body);
      break;
    case 'knowledgebase.entry.created':
      console.log('Knowledge Base entry created:', body);
      break;
    case null:
      // The test event has no event name; log the body to see what arrived
      console.log('No event name in body:', body);
      break;
    default:
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ success: true, type });
}
