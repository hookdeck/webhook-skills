// Generated with: veriff-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { verifyVeriffSignature } from '../../../lib/veriff';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.VERIFF_SHARED_SECRET;
  if (!secret) {
    console.error('VERIFF_SHARED_SECRET is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const signature = request.headers.get('x-hmac-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing X-HMAC-SIGNATURE header' }, { status: 400 });
  }

  // Read the RAW body: Veriff signs the exact bytes it sent
  const rawBody = await request.text();

  if (!verifyVeriffSignature(rawBody, signature, secret)) {
    console.error('Veriff signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only after the signature is verified
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Decision webhooks carry a `verification` object; event webhooks carry `action`
  if ('verification' in payload) {
    const verification = payload.verification;
    if (!verification) {
      // Veriff sends verification: null while a decision is not yet available
      console.log('Decision webhook without a verification object');
    } else {
      const ref = `session ${verification.id} (attempt ${verification.attemptId}, vendorData ${verification.vendorData})`;
      switch (verification.status) {
        case 'approved':
          console.log(`Verification approved: ${ref}`);
          // TODO: Mark the end-user as verified
          break;
        case 'declined':
          console.log(`Verification declined: ${ref}, reason: ${verification.reason}`);
          // TODO: Reject the end-user, log reasonCode
          break;
        case 'resubmission_requested':
          console.log(`Resubmission requested: ${ref}, reason: ${verification.reason}`);
          // TODO: Ask the end-user to retry with the same session
          break;
        case 'review':
          console.log(`Verification in review: ${ref}`);
          break;
        case 'expired':
          console.log(`Verification expired: ${ref}`);
          break;
        case 'abandoned':
          console.log(`Verification abandoned: ${ref}`);
          break;
        default:
          console.log(`Unhandled decision status: ${verification.status}`);
      }
    }
  } else if (payload.action) {
    const ref = `session ${payload.id} (attempt ${payload.attemptId})`;
    switch (payload.action) {
      case 'started':
        console.log(`End-user started the flow: ${ref}`);
        break;
      case 'submitted':
        console.log(`End-user submitted the attempt: ${ref}`);
        // TODO: Show a "waiting for decision" state
        break;
      case 'waiting_continued':
      case 'waiting_complete':
      case 'flow_finished':
      case 'flow_cancelled':
      case 'document_type_other_selected':
        console.log(`Flow event ${payload.action}: ${ref}`);
        break;
      default:
        console.log(`Unhandled event action: ${payload.action}`);
    }
  } else {
    console.log('Unhandled Veriff webhook type');
  }

  // Veriff expects a 200 within 5 seconds, otherwise it retries for up to a week
  return NextResponse.json({ received: true });
}
