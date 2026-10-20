// Generated with: sumsub-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifySumsubWebhook } from '../../../lib/verify-sumsub';

interface SumsubWebhookPayload {
  type: string;
  applicantId?: string;
  applicantActionId?: string;
  externalUserId?: string;
  levelName?: string;
  reviewStatus?: string;
  reviewResult?: {
    reviewAnswer?: 'GREEN' | 'RED';
    reviewRejectType?: 'RETRY' | 'FINAL';
  };
  sandboxMode?: boolean;
  testMode?: boolean;
  createdAtMs?: string;
}

export async function POST(request: NextRequest) {
  const secret = process.env.SUMSUB_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SUMSUB_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const digest = request.headers.get('x-payload-digest');
  const digestAlg = request.headers.get('x-payload-digest-alg');

  if (!digest) {
    return NextResponse.json({ error: 'Missing x-payload-digest header' }, { status: 400 });
  }

  // Read the raw bytes for verification - never re-serialise parsed JSON
  const rawBody = Buffer.from(await request.arrayBuffer());

  // Return 400 (not 401): Sumsub treats 401/403/404 as permanent and stops retrying
  if (!verifySumsubWebhook(rawBody, digest, digestAlg, secret)) {
    console.error('Sumsub webhook digest verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse the payload only after verification
  let payload: SumsubWebhookPayload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { type, applicantId, externalUserId, reviewStatus } = payload;

  // testMode is only present (true) on deliveries sent with "Test webhook" in the Webhook manager
  if (payload.testMode) {
    console.log('Test webhook from the Webhook manager');
  }

  console.log(`Received ${type} for applicant ${applicantId} (externalUserId: ${externalUserId}, sandbox: ${Boolean(payload.sandboxMode)})`);

  // Route on the body's type field (Sumsub sends no event-type header)
  switch (type) {
    case 'applicantCreated':
      console.log('Applicant created, review status:', reviewStatus);
      // TODO: Link applicantId to your user record
      break;

    case 'applicantPending':
      console.log('Applicant submitted documents, review pending');
      // TODO: Show "verification in progress" to the user
      break;

    case 'applicantReviewed': {
      // reviewAnswer is GREEN (approved) or RED (rejected)
      const answer = payload.reviewResult?.reviewAnswer;
      if (answer === 'GREEN') {
        console.log('Applicant approved');
        // TODO: Unlock verified features
      } else if (answer === 'RED') {
        // RETRY = user can resubmit, FINAL = permanently rejected
        console.log('Applicant rejected:', payload.reviewResult?.reviewRejectType);
        // TODO: Ask for resubmission or block the account
      }
      break;
    }

    case 'applicantOnHold':
      console.log('Applicant on hold, manual review required');
      // TODO: Flag for compliance team
      break;

    case 'applicantActionPending':
      console.log('Applicant action pending:', payload.applicantActionId);
      break;

    case 'applicantActionReviewed':
      console.log('Applicant action reviewed:', payload.applicantActionId, payload.reviewResult?.reviewAnswer);
      // TODO: Apply the action result (e.g. payment method check)
      break;

    case 'applicantReset':
      console.log('Applicant reset');
      // TODO: Clear cached verification state
      break;

    case 'applicantDeleted':
      console.log('Applicant deleted');
      // TODO: Remove local references to the applicant
      break;

    default:
      console.log(`Unhandled event type: ${type}`);
  }

  // Acknowledge quickly: Sumsub expects a response within 10 seconds
  return NextResponse.json({ received: true });
}
