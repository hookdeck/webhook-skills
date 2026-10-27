// Generated with: spacelift-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { classify, verifySpaceliftSignature } from '../../../lib/verify-spacelift';

// Latest stateVersion seen per run. Use a shared store in production.
const lastVersion = new Map<string, number>();

function handleMessage(payload: any): string {
  const type = classify(payload);

  switch (type) {
    case 'run': {
      const runId: string = payload.run?.id;
      const prev = lastVersion.get(runId);
      // Updates can arrive out of order: ignore a stale stateVersion.
      if (prev !== undefined && payload.stateVersion <= prev) {
        console.log(`Ignoring stale run update ${runId} v${payload.stateVersion}`);
        break;
      }
      lastVersion.set(runId, payload.stateVersion);
      console.log(`Run ${runId} on stack ${payload.stack?.id}: ${payload.state} (v${payload.stateVersion})`);
      // TODO: update your run tracking, notify a channel, etc.
      break;
    }

    case 'internal_error':
      console.log(`Spacelift internal error (${payload.severity}): ${payload.title}`);
      // TODO: alert the team
      break;

    default:
      console.log('Unhandled Spacelift message');
  }

  return type;
}

async function handle(request: NextRequest) {
  // Raw bytes, any content type. A missing body is zero bytes.
  const raw = Buffer.from(await request.arrayBuffer());

  if (!verifySpaceliftSignature(raw, request.headers.get('x-signature-256'))) {
    return NextResponse.json({ error: 'Invalid or missing signature' }, { status: 401 });
  }

  let payload: unknown = null;
  if (raw.length > 0) {
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (payload === null || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }
  }

  try {
    const type = handleMessage(payload);
    return NextResponse.json({ received: true, type });
  } catch (err) {
    console.error('Error handling Spacelift message:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }
}

// Spacelift doesn't name the HTTP method, so handle all of them.
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
