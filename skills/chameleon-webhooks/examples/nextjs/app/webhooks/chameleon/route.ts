// Generated with: chameleon-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyChameleonSignature, sentAtWithinTolerance, seenEventIds } from '../../../lib/verify-chameleon';

interface ChameleonEvent {
  id?: string;
  kind: string;
  sent_at?: string;
  data?: Record<string, any>;
}

function handleEvent(event: ChameleonEvent): void {
  const { kind } = event;
  const data = event.data ?? {};
  const who = data.profile ? data.profile.uid || data.profile.email || data.profile.id : 'unknown user';

  switch (kind) {
    case 'ping':
      console.log(`Ping from account ${data.account?.domain}`);
      break;

    case 'tour.started':
    case 'tour.completed':
    case 'tour.exited':
    case 'tour.snoozed':
    case 'tour.button.clicked':
      console.log(`${kind}: ${data.tour?.name} (${who})`);
      // TODO: record onboarding progress for the user
      break;

    case 'survey.started':
    case 'survey.completed':
    case 'survey.exited':
    case 'survey.snoozed':
    case 'survey.button.clicked':
      console.log(`${kind}: ${data.survey?.name} (${who})`);
      // TODO: record survey progress
      break;

    case 'response.finished':
      console.log(`Survey answered: "${data.response?.button_text}" (${who})`);
      // TODO: store data.response.button_text and data.response.input_text
      break;

    case 'embed.started':
    case 'embed.completed':
    case 'embed.exited':
    case 'embed.snoozed':
    case 'embed.button.clicked':
      console.log(`${kind}: ${data.embed?.name} (${who})`);
      break;

    case 'demo.started':
    case 'demo.reveal':
    case 'demo.finished':
    case 'demo.form.submitted':
    case 'demo.email.added':
      console.log(`${kind}: ${data.demo?.name} (${who})`);
      // TODO: sync the lead or engagement to your CRM
      break;

    case 'helpbar.search':
    case 'helpbar.answer':
    case 'helpbar.item.action':
    case 'helpbar.item.error':
      console.log(`${kind}: "${data.action?.query}" (${who})`);
      // TODO: feed search analytics
      break;

    case 'alert.triggered':
      console.log('Chameleon alert triggered');
      // TODO: notify your team
      break;

    default:
      console.log(`Unhandled event: ${kind}`);
  }
}

export async function POST(request: NextRequest) {
  // Raw bytes: verify exactly what Chameleon signed, then parse.
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyChameleonSignature(rawBody, request.headers.get('x-chameleon-signature'))) {
    return NextResponse.json({ error: 'Invalid or missing signature' }, { status: 401 });
  }

  let event: ChameleonEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.kind !== 'string') {
    return NextResponse.json({ error: 'Expected a JSON object with a kind' }, { status: 400 });
  }

  const tolerance = Number(process.env.CHAMELEON_SENT_AT_TOLERANCE_SECONDS);
  if (tolerance > 0 && !sentAtWithinTolerance(event.sent_at, tolerance)) {
    return NextResponse.json({ error: 'sent_at is outside the allowed window' }, { status: 400 });
  }

  // Chameleon retries non-200 responses, so dedupe on the webhook id.
  if (event.id && seenEventIds.has(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling Chameleon event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  if (event.id) seenEventIds.add(event.id);
  return NextResponse.json({ received: true });
}
