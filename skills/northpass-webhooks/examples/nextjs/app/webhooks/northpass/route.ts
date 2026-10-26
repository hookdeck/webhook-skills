// Generated with: northpass-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyNorthpassSignature } from '../../../lib/verify-northpass';

interface NorthpassEvent {
  id?: string;
  type?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attributes?: any;
  [key: string]: unknown;
}

// In-memory de-duplication on the event id. Use a durable store in production.
const seen = new Set<string>();

function handleEvent(event: NorthpassEvent): void {
  const { type, id } = event;

  switch (type) {
    case 'learner_created_events':
      console.log(`Learner created (event ${id})`);
      // TODO: create the learner in your system (see data.included for the person)
      break;

    case 'person_activated_events':
      console.log(`Person activated (event ${id})`);
      // TODO: mark the learner as active
      break;

    case 'learner_enrolled_to_course_events':
      console.log(`Learner enrolled in a course (event ${id})`);
      // TODO: record the enrollment (data.relationships.course / person)
      break;

    case 'learner_started_course_events':
      console.log(`Learner started a course (event ${id})`);
      // TODO: record course progress
      break;

    case 'course_completed_events':
      console.log(`Course completed (event ${id})`);
      // TODO: issue credit or update the CRM
      break;

    case 'quiz_completed_events':
      console.log(`Quiz completed with value ${event.attributes?.value} (event ${id})`);
      // TODO: store the score (attributes.value, attributes.minimum_passing_score)
      break;

    case 'course_published_events':
      console.log(`Course published, version ${event.attributes?.version_number} (event ${id})`);
      // TODO: refresh your course catalog
      break;

    default:
      console.log(`Unhandled event type: ${type}`);
  }
}

export async function POST(request: NextRequest) {
  // Verify the exact bytes received, before any parsing.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-northpass-hmac-sha256');

  if (!verifyNorthpassSignature(rawBody, signature, process.env.NORTHPASS_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Invalid or missing signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const data = payload && typeof payload === 'object' ? (payload as { data?: unknown }).data : null;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return NextResponse.json({ error: 'Expected a JSON:API body with a data object' }, { status: 400 });
  }

  const event = data as NorthpassEvent;
  if (event.id && seen.has(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling Northpass event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  if (event.id) seen.add(event.id);
  return NextResponse.json({ received: true });
}
