// Generated with: railway-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyRailwayRequest } from '../../../lib/verify-railway';

interface RailwayPayload {
  type?: string;
  details?: { id?: string; [key: string]: unknown };
  resource?: { service?: { name?: string }; [key: string]: unknown };
  [key: string]: unknown;
}

function handleEvent(payload: RailwayPayload): void {
  const { type, details, resource } = payload;
  const service = resource?.service?.name;

  switch (type) {
    case 'Deployment.failed':
      console.log(`Deployment failed${service ? ` for ${service}` : ''}: ${details?.id}`);
      // TODO: alert the team (details.commitMessage, resource.project, resource.environment)
      break;

    default:
      // Other deployment states (Deployment.<state>) and alert types are not enumerated in
      // Railway's docs, so match on the prefix and log anything else.
      if (typeof type === 'string' && type.startsWith('Deployment.')) {
        console.log(`Deployment ${type.slice('Deployment.'.length)}${service ? ` for ${service}` : ''}`);
        // TODO: update your deploy dashboard
      } else {
        console.log(`Unhandled event: ${type}`);
      }
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyRailwayRequest(request.headers)) {
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
    handleEvent(payload as RailwayPayload);
  } catch (err) {
    console.error('Error handling Railway event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
