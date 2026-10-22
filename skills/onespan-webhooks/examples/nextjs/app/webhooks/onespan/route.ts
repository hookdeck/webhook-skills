// Generated with: onespan-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyOneSpanRequest } from '../../../lib/verify-onespan';

function handleEvent(payload: Record<string, unknown>): void {
  // The event type is the `name` field of the JSON body.
  switch (payload.name) {
    case 'PACKAGE_CREATE':
      console.log(`Package created: ${payload.packageId}`);
      // TODO: store OneSpan's package ID next to your own transaction ID
      break;

    case 'PACKAGE_ACTIVATE':
      console.log(`Package sent to signers: ${payload.packageId}`);
      break;

    case 'DOCUMENT_SIGNED':
      console.log(`Document ${payload.documentId} signed by ${payload.sessionUser} in ${payload.packageId}`);
      // TODO: record per-document progress
      break;

    case 'SIGNER_COMPLETE':
      console.log(`Signer ${payload.sessionUser} completed package ${payload.packageId}`);
      break;

    case 'PACKAGE_COMPLETE':
      console.log(`Package complete: ${payload.packageId}`);
      // TODO: queue a job that downloads the signed documents by packageId
      break;

    case 'PACKAGE_DECLINE':
      console.log(`Package ${payload.packageId} declined: ${payload.message}`);
      // TODO: decide the next step from the decline reason
      break;

    case 'EMAIL_BOUNCE':
      console.log(`Email bounced for ${payload.packageId}: ${payload.message}`);
      break;

    default:
      console.log(`Unhandled OneSpan event: ${String(payload.name)}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyOneSpanRequest(request.headers)) {
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
    console.error('Error handling OneSpan webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
