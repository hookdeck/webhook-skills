// Generated with: dynatrace-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyDynatraceRequest } from '../../../lib/verify-dynatrace';

// Illustrative template: Dynatrace sends whatever payload template you configure.
interface DynatracePayload {
  State?: string;
  ProblemID?: string;
  ProblemTitle?: string;
  [key: string]: unknown;
}

function handleProblem(payload: DynatracePayload): void {
  const { State: state, ProblemID: id, ProblemTitle: title } = payload;

  switch (state) {
    case 'OPEN':
      console.log(`Problem opened: ${id} ${title}`);
      // TODO: page on-call or open a ticket (payload.ImpactedEntity, payload.ProblemURL)
      break;

    case 'RESOLVED':
      console.log(`Problem resolved: ${id} ${title}`);
      // TODO: close the matching ticket
      break;

    default:
      console.log(`Unhandled problem state: ${state}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyDynatraceRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook secret header' }, { status: 401 });
  }

  // Read as text so any content type (JSON, text, XML) is accepted.
  const raw = await request.text();

  let payload: unknown = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    // not JSON
  }

  try {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      handleProblem(payload as DynatracePayload);
    } else {
      console.log(`Received non-JSON notification (${raw.length} bytes)`);
    }
  } catch (err) {
    console.error('Error handling Dynatrace notification:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
