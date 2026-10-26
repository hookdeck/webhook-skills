// Generated with: hackerone-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyHackerOne } from '../../../lib/verify-hackerone';

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

function handleEvent(eventName: string, body: Record<string, unknown>): void {
  // Every field is untrusted: check the type of each level before reading into it.
  const data = isObject(body.data) ? body.data : {};
  const report = isObject(data.report) ? data.report : {};
  const attrs = isObject(report.attributes) ? report.attributes : {};
  const id = typeof report.id === 'string' ? report.id : 'unknown';
  const title = typeof attrs.title === 'string' ? attrs.title : '';

  switch (eventName) {
    case 'report_created':
      console.log(`New report ${id}: ${title}`);
      // TODO: create a ticket in your issue tracker
      break;

    case 'report_new':
      console.log(`Report ${id} needs program input`);
      break;

    case 'report_triaged':
      console.log(`Report ${id} triaged`);
      // TODO: assign an owner
      break;

    case 'report_bounty_awarded':
      console.log(`Bounty awarded on report ${id}`);
      // TODO: record the payout
      break;

    case 'report_comment_created':
      console.log(`Comment on report ${id}`);
      break;

    case 'report_resolved':
      console.log(`Report ${id} resolved`);
      // TODO: close the linked ticket
      break;

    case 'report_closed_as_duplicate':
    case 'report_closed_as_informative':
    case 'report_closed_as_spam':
    case 'report_closed_as_not_applicable':
      console.log(`Report ${id} closed: ${eventName}`);
      break;

    default:
      console.log(`Unhandled HackerOne event: ${eventName.slice(0, 100)}`);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.HACKERONE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('HACKERONE_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes: verify exactly what was received, whatever the Content-Type.
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyHackerOne(rawBody, request.headers.get('x-h1-signature'), secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // The event name is only in the X-H1-Event header.
  const eventName = request.headers.get('x-h1-event');
  if (!eventName) {
    return NextResponse.json({ error: 'Missing X-H1-Event header' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!isObject(body)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(eventName, body);
  } catch (err) {
    console.error('Error handling HackerOne webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
