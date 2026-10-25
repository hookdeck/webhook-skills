// Generated with: autosana-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifySignature } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  // Raw body is required for signature verification
  const rawBody = await request.text();
  const signature = request.headers.get('x-autosana-signature-256');

  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Autosana-Signature-256 header' }, { status: 400 });
  }
  if (!verifySignature(rawBody, signature, process.env.AUTOSANA_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let payload: {
    event?: string;
    app?: { name?: string };
    summary?: { total_groups?: number; passed_groups?: number; failed_groups?: number };
    run_groups?: { name?: string; status?: string; url?: string }[];
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // The event name is in the body (`event`); there is no event header
  switch (payload.event) {
    case 'batch.completed': {
      const s = payload.summary || {};
      console.log(
        `Batch completed for ${payload.app?.name}: ${s.passed_groups}/${s.total_groups} groups passed, ${s.failed_groups} failed`
      );
      for (const group of payload.run_groups || []) {
        console.log(`  ${group.name}: ${group.status} (${group.url})`);
      }
      break;
    }
    default:
      console.log('Unhandled event:', payload.event);
  }

  return NextResponse.json({ received: true });
}
