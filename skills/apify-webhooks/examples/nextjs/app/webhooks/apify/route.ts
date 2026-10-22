// Generated with: apify-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyApifyRequest } from '../../../lib/verify-apify';

interface ApifyPayload {
  eventType?: string;
  eventData?: { actorId?: string; actorRunId?: string; actorTaskId?: string; actorBuildId?: string };
  [key: string]: unknown;
}

function handleEvent(payload: ApifyPayload): void {
  const { eventType } = payload;
  const eventData = payload.eventData ?? {};

  switch (eventType) {
    case 'ACTOR.RUN.CREATED':
      console.log(`Run created: ${eventData.actorRunId}`);
      break;

    case 'ACTOR.RUN.SUCCEEDED':
      console.log(`Run succeeded: ${eventData.actorRunId}`);
      // TODO: fetch results from /v2/actor-runs/{actorRunId}/dataset/items
      break;

    case 'ACTOR.RUN.FAILED':
      console.log(`Run failed: ${eventData.actorRunId}`);
      // TODO: alert or open a ticket
      break;

    case 'ACTOR.RUN.ABORTED':
      console.log(`Run aborted: ${eventData.actorRunId}`);
      break;

    case 'ACTOR.RUN.TIMED_OUT':
      console.log(`Run timed out: ${eventData.actorRunId}`);
      // TODO: alert or retry with a longer timeout
      break;

    case 'ACTOR.RUN.RESURRECTED':
      console.log(`Run resurrected: ${eventData.actorRunId}`);
      break;

    case 'ACTOR.BUILD.CREATED':
      console.log(`Build created: ${eventData.actorBuildId}`);
      break;

    case 'ACTOR.BUILD.SUCCEEDED':
      console.log(`Build succeeded: ${eventData.actorBuildId}`);
      break;

    case 'ACTOR.BUILD.FAILED':
      console.log(`Build failed: ${eventData.actorBuildId}`);
      // TODO: alert the Actor owner
      break;

    case 'ACTOR.BUILD.ABORTED':
      console.log(`Build aborted: ${eventData.actorBuildId}`);
      break;

    case 'ACTOR.BUILD.TIMED_OUT':
      console.log(`Build timed out: ${eventData.actorBuildId}`);
      break;

    default:
      console.log(`Unhandled event: ${eventType}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyApifyRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook secret header' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read as text so any content type is accepted.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as ApifyPayload);
  } catch (err) {
    console.error('Error handling Apify event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
