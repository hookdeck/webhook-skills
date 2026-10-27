// Generated with: fountain-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyFountainSignature, classify } from '../../../lib/verify-fountain';

type Payload = Record<string, any>;

function handleEvent(kind: 'applicant' | 'worker' | null, payload: Payload): void {
  switch (kind) {
    case 'applicant': {
      const applicant = payload.applicant as Payload;
      console.log(`Applicant ${applicant.id} (${applicant.name}) is in stage: ${applicant.stage?.title}`);
      for (const check of Array.isArray(applicant.background_checks) ? applicant.background_checks : []) {
        console.log(`  Background check ${check.id ?? ''} status: ${check.status}`);
      }
      // TODO: sync the stage change or background-check result to your system
      break;
    }

    case 'worker':
      console.log(`Worker ${payload.id} (${payload.name}) is_active=${payload.is_active}`);
      for (const check of payload.data_collection_checks ?? []) {
        console.log(`  Document check ${check.id}: ${check.status}`);
      }
      // TODO: activate/deactivate the worker, or fetch approved documents
      break;

    default:
      console.log('Unhandled Fountain payload shape');
  }
}

export async function POST(request: NextRequest) {
  // Read the raw bytes so the exact body is verified; parse only afterwards.
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyFountainSignature(rawBody, request.headers.get('x-obiq-signature-v2'))) {
    return NextResponse.json({ error: 'Invalid or missing signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(classify(payload as Payload), payload as Payload);
  } catch (err) {
    console.error('Error handling Fountain webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
