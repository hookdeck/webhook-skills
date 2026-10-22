// Generated with: breezy-hr-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyBreezySignature } from '../../../lib/verify';

export async function POST(request: NextRequest) {
  // Raw body is required: the signature covers the exact bytes Breezy sent
  const rawBody = await request.text();
  const signature = request.headers.get('x-hook-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Hook-Signature header' }, { status: 400 });
  }

  if (!verifyBreezySignature(rawBody, signature, process.env.BREEZY_HR_WEBHOOK_SECRET)) {
    console.error('Breezy HR signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after verification
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Envelope: { _id, type, object, creation_date }. Deduplicate on _id.
  const { _id: eventId, type, object } = event;
  console.log(`Received ${type} event (${eventId})`);

  switch (type) {
    case 'candidateAdded':
      console.log('Candidate added:', object?.candidate?.name, 'to', object?.position?.name);
      // TODO: Sync the candidate, notify the hiring team, etc.
      break;

    case 'candidateStatusUpdated':
      console.log(
        'Candidate moved:', object?.candidate?.name,
        `${object?.stage_was?.name} -> ${object?.stage?.name}`
      );
      // TODO: Trigger interview scheduling, background checks, etc.
      break;

    case 'candidateDeleted':
      console.log('Candidate deleted:', object?.candidate?._id);
      // TODO: Remove candidate data from downstream systems
      break;

    case 'companyPositionAdded':
      console.log('Position added:', object?.position?.name);
      break;

    case 'companyPositionUpdated':
      console.log('Position updated:', object?.position?.name);
      break;

    case 'companyPositionDeleted':
      console.log('Position deleted:', object?.position?._id);
      break;

    case 'companyPositionStateUpdated':
      console.log('Position state changed:', `${object?.state_was} -> ${object?.state_is}`);
      break;

    case 'companyNotePosted':
    case 'companyNoteUpdated':
    case 'companyNoteDeleted':
      console.log(`Team note event ${type}:`, object?.note_id);
      break;

    default:
      console.log('Unhandled event type:', type);
  }

  // Any 2xx tells Breezy the delivery succeeded
  return NextResponse.json({ received: true });
}
