// Generated with: vanta-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { parseVantaEvent } from '../../../lib/vanta';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.VANTA_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('VANTA_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing required webhook headers' }, { status: 400 });
  }

  // Read the RAW body: verification needs the exact bytes Vanta signed
  const rawBody = await request.text();

  try {
    // Checks HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${body}` against every
    // v1, signature and enforces the 5-minute timestamp window.
    new Webhook(secret).verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Vanta webhook verification failed:', message);
    const error = /timestamp/i.test(message) ? 'Timestamp too old' : 'Invalid signature';
    return NextResponse.json({ error }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { type, payload, domain } = parseVantaEvent(body);
  // svix-id is stable across retries: use it to deduplicate
  console.log(`Received Vanta webhook ${svixId}: ${type ?? `(${domain ?? 'unknown'} payload)`}`);

  switch (type) {
    case 'v1.questionnaire.status-changed':
      console.log('Questionnaire status changed:', payload.questionnaire);
      break;
    case 'v1.questionnaire.export-completed':
      console.log('Questionnaire export ready:', payload.export?.id);
      break;
    case 'v1.vendor.decision.created':
      console.log('Vendor decision:', payload.vendor?.id, payload.vendor?.decision?.status);
      break;
    case 'v1.trust-center.access-request.received':
      console.log('Trust Center access request received:', payload.accessRequest?.id);
      break;
    case 'v1.trust-center.access-request.approved':
      console.log('Trust Center access request approved:', payload.accessRequest?.id);
      break;
    case 'v1.evidence.status-changed':
      console.log('Evidence status:', payload.evidence?.oldStatus, '->', payload.evidence?.newStatus);
      break;
    case null:
      // No type in the body: fetch the referenced object from the Manage Vanta API if needed
      console.log(`Untyped ${domain} event:`, domain ? payload[domain] : payload);
      break;
    default:
      console.log('Unhandled event type:', type);
  }

  return NextResponse.json({ success: true, type, domain });
}
