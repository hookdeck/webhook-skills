// Generated with: athenahealth-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify X-Hub-Signature: "sha256=<hex>", an HMAC-SHA256 of the raw body keyed
 * with the X-Hub-Secret you sent when creating the FHIR Subscription (WebSub
 * content signing). Only the sha256 method is accepted.
 */
function verifyAthenahealthWebhook(rawBody: string, signatureHeader: string | null, secret: string | undefined): boolean {
  if (!signatureHeader || !secret || !signatureHeader.startsWith('sha256=')) return false;

  const sig = signatureHeader.slice('sha256='.length);
  // Validate hex first: Buffer.from(x, 'hex') silently truncates invalid input
  if (!/^[0-9a-f]{64}$/i.test(sig)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  // Both sides are 64 ASCII hex chars, so the Buffers have equal length
  return crypto.timingSafeEqual(Buffer.from(sig.toLowerCase()), Buffer.from(expected));
}

// One handler per notification event (a Bundle can batch several for one topic)
function handleEvent(topic: string, event: any) {
  const focus = event.focus?.reference || event.focus?.identifier?.value;
  // TODO: dedupe on event.id (delivery is at-least-once), then GET the focus resource
  switch (topic) {
    case 'Appointment.schedule':
      console.log(`Appointment scheduled: ${focus}`);
      break;
    case 'Appointment.cancel':
      console.log(`Appointment cancelled: ${focus}`);
      break;
    case 'Appointment.reschedule':
      console.log(`Appointment rescheduled: ${focus}`);
      break;
    case 'Appointment.check-in':
      console.log(`Appointment checked in: ${focus}`);
      break;
    case 'Appointment.update':
      console.log(`Appointment updated: ${focus}`);
      break;
    case 'Encounter.check-in':
      console.log(`Encounter checked in: ${focus}`);
      break;
    case 'Encounter.signoff':
      console.log(`Encounter signed off: ${focus}`);
      break;
    case 'LabResult.create':
      console.log(`Lab result created: ${focus}`);
      break;
    case 'LabResult.close':
      console.log(`Lab result closed: ${focus}`);
      break;
    case 'Patient.create':
    case 'Patient.update':
      console.log(`${topic}: ${focus}`);
      break;
    default:
      console.log(`Unhandled topic: ${topic}`);
  }
}

export async function POST(request: NextRequest) {
  // Raw body for signature verification (any content type)
  const body = await request.text();
  const signature = request.headers.get('x-hub-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Hub-Signature header' }, { status: 401 });
  }

  if (!verifyAthenahealthWebhook(body, signature, process.env.ATHENAHEALTH_WEBHOOK_SECRET)) {
    console.error('athenahealth signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after verification
  let bundle: any;
  try {
    bundle = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // entry[0] is the SubscriptionStatus; its topic URL ends in the topic name
  const status = bundle?.entry?.[0]?.resource;
  if (bundle?.resourceType !== 'Bundle' || status?.resourceType !== 'SubscriptionStatus') {
    return NextResponse.json({ error: 'Not a subscription notification Bundle' }, { status: 400 });
  }

  const topic = String(status.topic || '').split('/').pop() as string;
  for (const event of status.notificationEvent || []) {
    handleEvent(topic, event);
  }

  // Acknowledge fast: athenahealth expects a 2xx within 2 seconds
  return NextResponse.json({ received: true });
}
