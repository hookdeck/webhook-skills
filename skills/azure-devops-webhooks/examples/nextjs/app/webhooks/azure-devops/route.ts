// Generated with: azure-devops-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyAzureDevOpsRequest } from '../../../lib/verify-azure-devops';

interface AzureDevOpsPayload {
  eventType?: string;
  message?: { text?: string };
  [key: string]: unknown;
}

function handleEvent(payload: AzureDevOpsPayload): void {
  const { eventType } = payload;
  const text = payload.message?.text;

  switch (eventType) {
    case 'git.push':
      console.log(`Push: ${text}`);
      // TODO: trigger a build or sync (payload.resource.refUpdates, payload.resource.commits)
      break;

    case 'git.pullrequest.created':
      console.log(`Pull request created: ${text}`);
      // TODO: start a review workflow (payload.resource.pullRequestId)
      break;

    case 'git.pullrequest.updated':
      console.log(`Pull request updated: ${text}`);
      // TODO: refresh the review state
      break;

    case 'git.pullrequest.merged':
      console.log(`Pull request merged: ${text}`);
      // TODO: deploy or close linked tickets
      break;

    case 'workitem.created':
      console.log(`Work item created: ${text}`);
      // TODO: sync payload.resource.fields to your tracker
      break;

    case 'workitem.updated':
      console.log(`Work item updated: ${text}`);
      // TODO: apply payload.resource.fields changes
      break;

    case 'workitem.commented':
      console.log(`Work item commented: ${text}`);
      // TODO: sync the comment
      break;

    case 'build.complete':
      console.log(`Build complete: ${text}`);
      // TODO: report payload.resource.status / payload.resource.result
      break;

    case 'ms.vss-pipelines.run-state-changed-event':
      console.log(`Pipeline run state changed: ${text}`);
      // TODO: report payload.resource.run.state / payload.resource.run.result
      break;

    default:
      console.log(`Unhandled event: ${eventType}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyAzureDevOpsRequest(request.headers)) {
    return NextResponse.json(
      { error: 'Invalid or missing basic authentication credentials' },
      { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="azure-devops-webhooks"' } }
    );
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
    handleEvent(payload as AzureDevOpsPayload);
  } catch (err) {
    console.error('Error handling Azure DevOps event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
