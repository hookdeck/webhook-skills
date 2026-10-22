// Generated with: jfrog-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyJfrogRequest } from '../../../lib/verify-jfrog';

interface JfrogPayload {
  domain?: string;
  event_type?: string;
  data?: Record<string, unknown>;
}

/**
 * Every JFrog payload has a `domain` and an `event_type`. Dispatch on both.
 */
function handleEvent(payload: JfrogPayload): void {
  const { domain, event_type: eventType, data = {} } = payload;

  switch (`${domain}.${eventType}`) {
    case 'artifact.deployed':
      console.log(`Artifact deployed: ${data.repo_key}/${data.path}`);
      // TODO: trigger a scan or notify the team
      break;

    case 'artifact.deleted':
      console.log(`Artifact deleted: ${data.repo_key}/${data.path}`);
      // TODO: clean up downstream indexes
      break;

    case 'artifact.moved':
      console.log(`Artifact moved: ${data.source_repo_path} -> ${data.target_repo_path}`);
      // TODO: record the promotion
      break;

    case 'docker.pushed':
      console.log(`Docker tag pushed: ${data.image_name}:${data.tag}`);
      // TODO: roll out the new image
      break;

    case 'build.uploaded':
      console.log(`Build uploaded: ${data.build_name} #${data.build_number}`);
      // TODO: start the release pipeline
      break;

    case 'build.promoted':
      console.log(`Build promoted: ${data.build_name} #${data.build_number}`);
      // TODO: deploy the promoted build
      break;

    default:
      console.log(`Unhandled event: ${domain} ${eventType}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body (any content type works).
  if (!verifyJfrogRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing X-JFrog-Event-Auth' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as JfrogPayload);
  } catch (err) {
    console.error('Error handling JFrog event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
