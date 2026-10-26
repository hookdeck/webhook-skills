// Generated with: optimizely-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyOptimizelySignature } from '../../../lib/verify-optimizely';

type OptimizelyEvent = {
  event?: string;
  project_id?: number;
  timestamp?: number;
  data?: any;
};

function handleEvent(payload: OptimizelyEvent) {
  switch (payload.event) {
    case 'project.datafile_updated':
      console.log(`Datafile updated for ${payload.data?.environment} (revision ${payload.data?.revision})`);
      // TODO: re-fetch the datafile from payload.data.cdn_url
      break;
    case 'project.ruleset_updated':
      for (const change of Array.isArray(payload.data) ? payload.data : []) {
        console.log(`Ruleset change: ${change.change_type} on ${change.entity?.type}`);
      }
      // TODO: audit log, notify your team
      break;
    default:
      console.log(`Unhandled Optimizely event: ${payload.event}`);
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.OPTIMIZELY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('OPTIMIZELY_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Raw bytes for signature verification - don't use request.json() first
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyOptimizelySignature(rawBody, request.headers.get('x-hub-signature'), secret)) {
    console.error('Optimizely webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after verification
  let payload: OptimizelyEvent;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (payload === null || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  handleEvent(payload);
  return NextResponse.json({ received: true });
}
