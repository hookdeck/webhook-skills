// Generated with: currents-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyCurrentsRequest } from '../../../lib/verify-currents';

interface CurrentsPayload {
  event?: string;
  runUrl?: string;
  buildId?: string;
  groupId?: string;
  [key: string]: unknown;
}

function handleEvent(payload: CurrentsPayload): void {
  const { event, runUrl, buildId, groupId } = payload;

  switch (event) {
    case 'RUN_START':
      console.log(`Run started: ${buildId} ${runUrl}`);
      // TODO: post a "tests running" status
      break;

    case 'RUN_FINISH':
      console.log(`Run finished: ${buildId}${groupId ? ` (${groupId})` : ''} ${runUrl}`);
      // TODO: notify a channel or update a PR (payload.passes, payload.failures, payload.flaky)
      break;

    case 'RUN_TIMEOUT':
      console.log(`Run timed out: ${buildId} ${runUrl}`);
      // TODO: alert on the stuck CI job
      break;

    case 'RUN_CANCELED':
      console.log(`Run canceled: ${buildId} ${runUrl}`);
      // TODO: clear the pending status (counters are a snapshot)
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyCurrentsRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook credential' }, { status: 401 });
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
    handleEvent(payload as CurrentsPayload);
  } catch (err) {
    console.error('Error handling Currents event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
