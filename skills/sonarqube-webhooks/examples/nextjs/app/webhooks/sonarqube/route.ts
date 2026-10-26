import { NextRequest, NextResponse } from 'next/server';
import { verifySonarQubeSignature } from '../../../lib/verify-sonarqube';

// SonarQube has no event types: every delivery is an analysis result
type AnalysisPayload = {
  taskId?: string;
  status?: string;
  analysedAt?: string;
  project?: { key?: string; name?: string };
  qualityGate?: { name?: string; status?: string; conditions?: Array<Record<string, unknown>> };
  properties?: Record<string, unknown>;
};

function handleAnalysis(payload: AnalysisPayload) {
  const project = payload.project?.key;
  switch (payload.qualityGate?.status) {
    case 'OK':
      console.log(`Quality gate passed for ${project} (task ${payload.taskId})`);
      // TODO: Promote the build, post a success message
      break;

    case 'ERROR':
      console.log(`Quality gate failed for ${project} (task ${payload.taskId})`);
      // TODO: Block the deploy, notify the owner (see qualityGate.conditions)
      break;

    default:
      console.log(`Analysis ${payload.taskId} for ${project} has status ${payload.status}`);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.SONARQUBE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SONARQUBE_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Secret not configured' }, { status: 500 });
  }

  // Raw bytes for signature verification - don't use request.json() first
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifySonarQubeSignature(rawBody, request.headers.get('x-sonar-webhook-hmac-sha256'), secret)) {
    console.error('SonarQube webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after verification
  let payload: AnalysisPayload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (payload === null || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // SonarQube never retries and times out after 10 seconds: respond fast
  handleAnalysis(payload);

  return NextResponse.json({ received: true });
}
