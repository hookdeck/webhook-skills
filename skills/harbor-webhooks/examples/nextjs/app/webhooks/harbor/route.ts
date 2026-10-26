// Generated with: harbor-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { normalize, verifyHarborRequest } from '../../../lib/verify-harbor';

function handleEvent(payload: Record<string, unknown>): void {
  const { type, data } = normalize(payload);
  const repo = data?.repository?.repo_full_name;

  switch (type) {
    case 'PUSH_ARTIFACT':
      console.log(`Artifact pushed to ${repo}`);
      // TODO: trigger a build or deployment for the pushed artifact
      break;

    case 'PULL_ARTIFACT':
      console.log(`Artifact pulled from ${repo}`);
      break;

    case 'DELETE_ARTIFACT':
      console.log(`Artifact deleted from ${repo}`);
      break;

    case 'SCANNING_COMPLETED':
      console.log(`Scan completed for ${repo}`);
      // TODO: inspect scan_overview severity and gate promotion
      break;

    case 'SCANNING_STOPPED':
      console.log(`Scan stopped for ${repo}`);
      break;

    case 'SCANNING_FAILED':
      console.log(`Scan failed for ${repo}`);
      break;

    case 'QUOTA_EXCEED':
      console.log(`Project quota exceeded at ${repo}`);
      // TODO: alert the project owners
      break;

    case 'QUOTA_WARNING':
      console.log(`Project quota near threshold at ${repo}`);
      break;

    case 'REPLICATION':
      console.log(`Replication status: ${data?.replication?.job_status}`);
      break;

    case 'TAG_RETENTION':
      console.log(`Tag retention finished: ${data?.retention?.result}`);
      break;

    default:
      console.log(`Unhandled Harbor event type: ${type}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyHarborRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Authorization header' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read the raw text so any content type works.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as Record<string, unknown>);
  } catch (err) {
    console.error('Error handling Harbor webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
